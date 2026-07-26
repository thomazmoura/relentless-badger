package com.relentlessbadger.app.scenario

import com.relentlessbadger.app.data.Recurrence
import com.relentlessbadger.app.data.RecurUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.ConnectException
import java.time.Instant

class EditScheduleScenarios : ScenarioTest() {

    private val minute = BadgerScenario.MINUTE

    @Test
    fun `editing the start time reschedules the alarm and pushes the update`() = scenario {
        val task = givenSyncedTask("water plants")
        val newStart = clock.now() + 3 * 24 * 60 * minute

        whenScheduleEdited(task.id, newStart, task.repeatIntervalMinutes)

        thenAlarmScheduledAt(task.id, newStart)
        assertTrue(localTask(task.id).pendingUpdate)

        whenSyncRuns()
        val (updatedId, request) = server.receivedScheduleUpdates.single()
        assertEquals(task.id, updatedId)
        assertEquals(Instant.ofEpochMilli(newStart).toString(), request.firstWarningAt)
        assertFalse(localTask(task.id).pendingUpdate)
    }

    @Test
    fun `clearing the start time falls back to the normal nag cadence`() = scenario {
        val startAt = clock.now() + 24 * 60 * minute
        val task = whenTaskCreated("water plants", startAt)

        whenScheduleEdited(task.id, null, task.repeatIntervalMinutes)

        val edited = localTask(task.id)
        assertNull(edited.firstWarningAtMillis)
        // Back to createdAt + initialDelay (60m default).
        thenAlarmScheduledAt(task.id, task.createdAtMillis + 60 * minute)
    }

    @Test
    fun `changing the nag interval re-arms the alarm and future repeats`() = scenario {
        val task = givenSyncedTask("water plants")
        whenTimeAdvancesMinutes(70) // past the first fire: task is actively nagging

        whenScheduleEdited(task.id, null, repeatIntervalMinutes = 60)

        val edited = localTask(task.id)
        assertEquals(60, edited.repeatIntervalMinutes)
        val armedAt = alarms.scheduled[task.id]!!
        assertTrue("next fire must be in the future", armedAt > clock.now())

        whenTimeAdvancesMinutes(((armedAt - clock.now()) / minute).toInt())
        whenReminderFires(task.id)
        thenAlarmScheduledAt(task.id, clock.now() + 60 * minute)
    }

    @Test
    fun `an offline edit keeps its flag through a failed sync and flushes later`() = scenario {
        val task = givenSyncedTask("water plants")
        val newStart = clock.now() + 24 * 60 * minute

        givenOffline()
        whenScheduleEdited(task.id, newStart, task.repeatIntervalMinutes)
        whenSyncFailsWith { it is ConnectException }
        assertTrue(localTask(task.id).pendingUpdate)

        givenOnline()
        whenSyncRuns()
        assertFalse(localTask(task.id).pendingUpdate)
        assertEquals(1, server.receivedScheduleUpdates.size)
    }

    @Test
    fun `editing a task whose create response was lost repairs the server`() = scenario {
        givenOffline()
        val task = whenTaskCreated("water plants")

        // The create reaches the server but the response is lost.
        givenOnline()
        server.dropCreateResponses = true
        whenSyncFailsWith { it is ConnectException }
        assertTrue(localTask(task.id).pendingCreate)

        val newStart = clock.now() + 24 * 60 * minute
        whenScheduleEdited(task.id, newStart, 30)

        server.dropCreateResponses = false
        whenSyncRuns()

        // The re-pushed create was ignored idempotently; the PUT repaired it.
        val serverTask = server.tasks[task.id]!!
        assertEquals(Instant.ofEpochMilli(newStart).toString(), serverTask.firstWarningAt)
        assertEquals(30, serverTask.repeatIntervalMinutes)
        val local = localTask(task.id)
        assertFalse(local.pendingCreate)
        assertFalse(local.pendingUpdate)
    }

    @Test
    fun `an edit for a task deleted elsewhere is dropped and the row pruned`() = scenario {
        val task = givenSyncedTask("water plants")
        server.tasks.clear() // deleted on the server by another device

        whenScheduleEdited(task.id, clock.now() + 24 * 60 * minute, task.repeatIntervalMinutes)
        whenSyncRuns()

        thenTaskGone("water plants")
        assertTrue(server.receivedScheduleUpdates.isEmpty())
    }

    @Test
    fun `a schedule edited on another device is adopted on pull`() = scenario {
        val task = givenSyncedTask("water plants")
        val remoteStart = clock.now() + 48 * 60 * minute
        server.tasks[task.id] = server.tasks[task.id]!!.copy(
            firstWarningAt = Instant.ofEpochMilli(remoteStart).toString(),
            repeatIntervalMinutes = 45,
            recurEveryN = 1,
            recurUnit = "days",
            seriesId = task.id,
        )

        whenSyncRuns()

        val pulled = localTask(task.id)
        assertEquals(remoteStart, pulled.firstWarningAtMillis)
        assertEquals(45, pulled.repeatIntervalMinutes)
        assertEquals(1, pulled.recurEveryN)
        thenAlarmScheduledAt(task.id, remoteStart)
    }

    @Test
    fun `a local unpushed edit wins over the server copy on pull`() = scenario {
        val task = givenSyncedTask("water plants")
        val localStart = clock.now() + 24 * 60 * minute

        givenOffline()
        whenScheduleEdited(task.id, localStart, task.repeatIntervalMinutes)

        givenOnline()
        server.tasks[task.id] = server.tasks[task.id]!!.copy(
            firstWarningAt = Instant.ofEpochMilli(clock.now() + 99 * 60 * minute).toString(),
        )
        whenSyncRuns()

        // The push wins: our edit reached the server, the stale server copy
        // never overwrote the local row.
        assertEquals(localStart, localTask(task.id).firstWarningAtMillis)
        assertEquals(
            Instant.ofEpochMilli(localStart).toString(),
            server.tasks[task.id]!!.firstWarningAt,
        )
    }

    @Test
    fun `a snooze survives a pull whose schedule is unchanged`() = scenario {
        val task = givenSyncedTask("water plants")
        whenSnoozed(task.id, 90)
        val snoozedUntil = clock.now() + 90 * minute
        thenAlarmScheduledAt(task.id, snoozedUntil)

        whenSyncRuns()

        assertEquals(snoozedUntil, localTask(task.id).nextFireAtMillis)
        thenAlarmScheduledAt(task.id, snoozedUntil)
    }

    @Test
    fun `a snooze until an exact time also survives a pull whose schedule is unchanged`() = scenario {
        val task = givenSyncedTask("water plants")
        val snoozedUntil = clock.now() + 17 * 60 * minute
        whenSnoozedUntil(task.id, snoozedUntil)

        whenSyncRuns()

        assertEquals(snoozedUntil, localTask(task.id).nextFireAtMillis)
        thenAlarmScheduledAt(task.id, snoozedUntil)
    }
}
