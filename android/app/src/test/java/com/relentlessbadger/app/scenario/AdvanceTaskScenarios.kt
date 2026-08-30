package com.relentlessbadger.app.scenario

import com.relentlessbadger.app.data.RecurUnit
import com.relentlessbadger.app.data.Recurrence
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Advancing pulls a scheduled occurrence to now without moving the series:
 * the cadence stays anchored on the occurrence's own start time, not on the
 * moment the user got impatient.
 */
class AdvanceTaskScenarios : ScenarioTest() {

    private val day = 24 * 60 * BadgerScenario.MINUTE

    /** START_OF_TIME is a Thursday, so tomorrow is a Friday. */
    private val weeklyOnFriday = Recurrence(1, RecurUnit.WEEKS, daysOfWeek = 1 shl 4)

    private fun BadgerScenario.tomorrowAt9() = clock.now() + day + 9 * 60 * BadgerScenario.MINUTE

    @Test
    fun `advancing a scheduled task starts it nagging now`() = scenario {
        val startAt = tomorrowAt9()
        val task = whenTaskCreated("water plants", startAt)

        whenTaskAdvanced(task.id)

        val advanced = localTask(task.id)
        assertEquals(clock.now(), advanced.firstWarningAtMillis)
        assertEquals(clock.now(), advanced.nextFireAtMillis)
        assertTrue("the schedule change must reach the server", advanced.pendingUpdate)
        thenAlarmScheduledAt(task.id, clock.now())
    }

    @Test
    fun `advancing a weekly task moves the series to next week, not a week from today`() =
        scenario {
            val startAt = tomorrowAt9()
            val task = whenTaskCreated("water plants", startAt, weeklyOnFriday)

            whenTaskAdvanced(task.id)

            val spawned = taskDao.getActive().single { it.id != task.id }
            assertEquals("next occurrence must stay on the series' Friday", startAt + 7 * day,
                spawned.firstWarningAtMillis)
            assertNotEquals(
                "the series must not re-anchor on today",
                clock.now() + 7 * day,
                spawned.firstWarningAtMillis,
            )
            assertEquals("water plants", spawned.title)
            assertEquals(task.seriesId, spawned.seriesId)
            assertTrue(spawned.pendingCreate)
            thenAlarmScheduledAt(spawned.id, startAt + 7 * day)
        }

    @Test
    fun `the advanced occurrence keeps its series but drops the rule`() = scenario {
        val task = whenTaskCreated("water plants", tomorrowAt9(), weeklyOnFriday)

        whenTaskAdvanced(task.id)

        val advanced = localTask(task.id)
        assertEquals("history must still tie back to the series", task.seriesId, advanced.seriesId)
        assertNull(advanced.recurEveryN)
        assertNull(advanced.recurUnit)
        assertNull(advanced.recurDaysOfWeek)
    }

    @Test
    fun `completing an advanced occurrence spawns nothing further`() = scenario {
        val task = whenTaskCreated("water plants", tomorrowAt9(), weeklyOnFriday)
        whenTaskAdvanced(task.id)
        val spawned = taskDao.getActive().single { it.id != task.id }

        whenTaskCompleted(task.id)

        assertEquals(
            "only the already-spawned occurrence may remain",
            listOf(spawned.id),
            taskDao.getActive().map { it.id },
        )
        thenCompletionCached("water plants", cancelled = false)
    }

    @Test
    fun `advancing a one-off scheduled task spawns no occurrence`() = scenario {
        val task = whenTaskCreated("call the vet", tomorrowAt9())

        whenTaskAdvanced(task.id)

        assertEquals(listOf(task.id), taskDao.getActive().map { it.id })
    }

    @Test
    fun `advancing a task that is already nagging changes nothing`() = scenario {
        val startAt = tomorrowAt9()
        val task = whenTaskCreated("water plants", startAt, weeklyOnFriday)
        whenTimeAdvancesMinutes(2 * 24 * 60) // past the first occurrence

        whenTaskAdvanced(task.id)

        val unchanged = localTask(task.id)
        assertEquals(startAt, unchanged.firstWarningAtMillis)
        assertEquals(1, unchanged.recurEveryN)
        assertEquals(
            "an already-nagging task must not spawn a second occurrence",
            listOf(task.id),
            taskDao.getActive().map { it.id },
        )
    }

    @Test
    fun `both the advanced occurrence and the next one reach the server on sync`() = scenario {
        val startAt = tomorrowAt9()
        val task = whenTaskCreated("water plants", startAt, weeklyOnFriday)
        whenSyncRuns()
        server.receivedCreates.clear()

        whenTaskAdvanced(task.id)
        whenSyncRuns()

        val (updatedId, update) = server.receivedScheduleUpdates.single()
        assertEquals(task.id, updatedId)
        assertNull("the rule moved to the next occurrence", update.recurEveryN)
        val spawnedCreate = server.receivedCreates.single()
        assertEquals(1, spawnedCreate.recurEveryN)
        assertEquals(task.seriesId, spawnedCreate.seriesId)
    }
}
