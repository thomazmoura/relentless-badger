package com.relentlessbadger.app.scenario

import com.relentlessbadger.app.data.CalendarEntryKind
import com.relentlessbadger.app.data.Recurrence
import com.relentlessbadger.app.data.RecurUnit
import com.relentlessbadger.app.data.buildMonthEntries
import kotlinx.coroutines.flow.first
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.YearMonth
import java.time.ZoneId

class CancelTaskScenarios : ScenarioTest() {

    @Test
    fun `cancelling closes the task and stops the nagging, flagged as not done`() = scenario {
        val task = givenSyncedTask("water plants")

        whenTaskCancelled(task.id)

        thenTaskGone("water plants")
        assertTrue(alarms.cancelled.contains(task.id))
        thenCompletionCached("water plants", atMillis = clock.now(), cancelled = true)
    }

    @Test
    fun `completing still records the task as done`() = scenario {
        val task = givenSyncedTask("water plants")

        whenTaskCompleted(task.id)
        whenSyncRuns()

        thenCompletionCached("water plants", cancelled = false)
        assertFalse("done, not cancelled", server.tasks[task.id]!!.cancelled)
    }

    @Test
    fun `a cancellation made offline reaches the server flagged, with the local cancel time`() = scenario {
        val task = givenSyncedTask("water plants")
        givenOffline()

        whenTaskCancelled(task.id)
        val cancelledAtMillis = clock.now()

        whenTimeAdvancesMinutes(90)
        givenOnline()
        whenSyncRuns()

        assertEquals(listOf(task.id), server.receivedCompletions)
        val pushed = server.tasks[task.id]!!
        assertTrue("server records it as cancelled", pushed.cancelled)
        assertEquals(
            "server records the local cancel time, not the sync time",
            Instant.ofEpochMilli(cancelledAtMillis).toString(),
            pushed.completedAt,
        )
        assertNull("row removed once acknowledged", taskDao.getById(task.id))
    }

    @Test
    fun `cancelling an occurrence keeps the recurring series alive`() = scenario {
        val day = 24 * 60 * BadgerScenario.MINUTE
        val startAt = clock.now() + 60 * BadgerScenario.MINUTE
        val task = whenTaskCreated("water plants", startAt, Recurrence(1, RecurUnit.DAYS))
        whenTimeAdvancesMinutes(90) // past the first occurrence

        whenTaskCancelled(task.id)

        val spawned = taskDao.getActive().single()
        assertEquals("water plants", spawned.title)
        assertEquals(startAt + day, spawned.firstWarningAtMillis)
        assertEquals(task.id, spawned.seriesId)
        thenAlarmScheduledAt(spawned.id, startAt + day)
        thenCompletionCached("water plants", cancelled = true)
    }

    @Test
    fun `the calendar reads a cancellation back through Room and can show it`() = scenario {
        val task = givenSyncedTask("water plants")

        whenTaskCancelled(task.id)
        whenSyncRuns()

        // Exactly the path the calendar screen uses: the month query, then
        // bucketing — so a wrong column mapping or a lost flag shows up here.
        val month = YearMonth.from(
            Instant.ofEpochMilli(clock.now()).atZone(ZoneId.systemDefault()).toLocalDate(),
        )
        val zone = ZoneId.systemDefault()
        val completed = repository.completedTasksBetween(
            month.atDay(1).atStartOfDay(zone).toInstant().toEpochMilli(),
            month.plusMonths(1).atDay(1).atStartOfDay(zone).toInstant().toEpochMilli(),
        ).first()
        assertEquals(listOf(true), completed.map { it.cancelled })

        val hidden = buildMonthEntries(emptyList(), completed, month, zone)
        assertTrue("hidden by default", hidden.isEmpty())

        val shown = buildMonthEntries(emptyList(), completed, month, zone, includeCancelled = true)
        assertEquals(
            listOf(CalendarEntryKind.CANCELLED),
            shown.values.flatten().map { it.kind },
        )
    }

    @Test
    fun `a cancellation pulled from another device is cached as cancelled`() = scenario {
        givenServerHasCompletedTask("water plants", clock.now(), cancelled = true)

        whenSyncRuns()

        thenCompletionCached("water plants", cancelled = true)
    }
}
