package com.relentlessbadger.app.scenario

import com.relentlessbadger.app.data.Recurrence
import com.relentlessbadger.app.data.RecurUnit
import com.relentlessbadger.app.data.computeNextOccurrence
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RecurringTaskScenarios : ScenarioTest() {

    private val daily = Recurrence(1, RecurUnit.DAYS)
    private val day = 24 * 60 * BadgerScenario.MINUTE

    @Test
    fun `creating a recurring task arms the alarm at its start and pushes the rule`() = scenario {
        val startAt = clock.now() + day
        val task = whenTaskCreated("water plants", startAt, daily)

        thenAlarmScheduledAt(task.id, startAt)
        assertEquals(task.id, task.seriesId)

        whenSyncRuns()
        val pushed = server.receivedCreates.single()
        assertEquals(1, pushed.recurEveryN)
        assertEquals("days", pushed.recurUnit)
        assertEquals(task.id, pushed.seriesId)
    }

    @Test
    fun `completing a recurring task spawns the next occurrence locally`() = scenario {
        givenOffline()
        val startAt = clock.now() + 60 * BadgerScenario.MINUTE
        val task = whenTaskCreated("water plants", startAt, daily)
        whenTimeAdvancesMinutes(90) // past the first occurrence

        whenTaskCompleted(task.id)

        val spawned = taskDao.getActive().single()
        assertTrue(spawned.pendingCreate)
        assertEquals("water plants", spawned.title)
        assertEquals(startAt + day, spawned.firstWarningAtMillis)
        assertEquals(task.id, spawned.seriesId)
        thenAlarmScheduledAt(spawned.id, startAt + day)
        thenNoAlarmArmed(task.id)
    }

    @Test
    fun `completion and the spawned occurrence both reach the server on sync`() = scenario {
        val startAt = clock.now() + 60 * BadgerScenario.MINUTE
        val task = whenTaskCreated("water plants", startAt, daily)
        whenSyncRuns()

        whenTaskCompleted(task.id)
        whenSyncRuns()

        assertEquals(listOf(task.id), server.receivedCompletions)
        val spawnedCreate = server.receivedCreates.last()
        assertEquals(task.id, spawnedCreate.seriesId)
        thenServerHasOpenTask("water plants")
        assertFalse(taskDao.getActive().single().pendingCreate)
    }

    @Test
    fun `completing twice spawns only one next occurrence`() = scenario {
        givenOffline()
        val startAt = clock.now() + 60 * BadgerScenario.MINUTE
        val task = whenTaskCreated("water plants", startAt, daily)

        whenTaskCompleted(task.id)
        whenTaskCompleted(task.id)

        assertEquals(1, taskDao.getActive().size)
    }

    @Test
    fun `completing long after missed occurrences spawns exactly one future one`() = scenario {
        givenOffline()
        val startAt = clock.now() + 60 * BadgerScenario.MINUTE
        val task = whenTaskCreated("water plants", startAt, daily)
        whenTimeAdvancesMinutes(5 * 24 * 60) // five missed days

        whenTaskCompleted(task.id)

        val spawned = taskDao.getActive().single()
        assertNotNull(spawned.firstWarningAtMillis)
        assertTrue(
            "next occurrence must be in the future",
            spawned.firstWarningAtMillis!! > clock.now(),
        )
        assertEquals(
            computeNextOccurrence(startAt, daily, clock.now()),
            spawned.firstWarningAtMillis,
        )
    }

    @Test
    fun `backdating a recurring completion still anchors the next occurrence after now`() = scenario {
        givenOffline()
        val startAt = clock.now() + 60 * BadgerScenario.MINUTE
        val task = whenTaskCreated("water plants", startAt, daily)
        whenTimeAdvancesMinutes(3 * 24 * 60) // done three days ago, tapped today

        whenTaskCompleted(task.id, atMillis = clock.now() - 3 * 24 * 60 * BadgerScenario.MINUTE)

        val spawned = taskDao.getActive().single()
        assertTrue(
            "a backdated completion must not spawn an already-overdue occurrence",
            spawned.firstWarningAtMillis!! > clock.now(),
        )
        assertEquals(
            computeNextOccurrence(startAt, daily, clock.now()),
            spawned.firstWarningAtMillis,
        )
    }

    @Test
    fun `a recurring task pulled from another device spawns on completion`() = scenario {
        val startAt = clock.now() + 60 * BadgerScenario.MINUTE
        val dto = server.seedOpenTask(
            "water plants",
            firstWarningAtMillis = startAt,
            recurEveryN = 1,
            recurUnit = "days",
            seriesId = "series-1",
        )
        whenSyncRuns()

        whenTaskCompleted(dto.id)

        val spawned = taskDao.getActive().single()
        assertEquals("series-1", spawned.seriesId)
        assertEquals(startAt + day, spawned.firstWarningAtMillis)
    }

    @Test
    fun `a spawned occurrence survives a pull that does not list it yet`() = scenario {
        givenOffline()
        val startAt = clock.now() + 60 * BadgerScenario.MINUTE
        val task = whenTaskCreated("water plants", startAt, daily)
        whenTaskCompleted(task.id)

        givenOnline()
        server.failCreatesWithServerError = true
        whenSyncRuns() // create push fails, pull runs without the spawn

        val spawned = taskDao.getActive().single()
        assertTrue("unpushed spawn must survive the pull", spawned.pendingCreate)
        assertEquals(startAt + day, spawned.firstWarningAtMillis)
    }
}
