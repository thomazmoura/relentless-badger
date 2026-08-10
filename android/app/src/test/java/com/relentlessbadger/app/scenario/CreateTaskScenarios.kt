package com.relentlessbadger.app.scenario

import com.relentlessbadger.app.scenario.BadgerScenario.Companion.MINUTE
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class CreateTaskScenarios : ScenarioTest() {

    @Test
    fun `creating a task online shows it immediately, arms the first reminder and pushes it on sync`() = scenario {
        val task = whenTaskCreated("water plants")

        thenTaskVisible("water plants")
        thenAlarmScheduledAt(task.id, task.createdAtMillis + 60 * MINUTE)
        assertEquals("a sync should have been requested", 1, syncRequests.requests)

        whenSyncRuns()

        thenServerHasOpenTask("water plants")
        assertEquals("pushed with the locally minted id", task.id, server.receivedCreates.single().id)
        assertFalse("pendingCreate cleared once acknowledged", localTask(task.id).pendingCreate)
    }

    @Test
    fun `creating a task offline works fully locally and is pushed with the same id when connectivity returns`() = scenario {
        givenOffline()

        val task = whenTaskCreated("water plants")

        thenTaskVisible("water plants")
        thenAlarmScheduledAt(task.id, task.createdAtMillis + 60 * MINUTE)
        thenNothingPushed()

        givenOnline()
        whenSyncRuns()

        thenServerHasOpenTask("water plants")
        assertEquals(task.id, server.receivedCreates.single().id)
    }

    @Test
    fun `a custom first warning time is respected offline and carried in the push`() = scenario {
        givenOffline()
        val tonight = clock.now() + 8 * 60 * MINUTE

        val task = whenTaskCreated("call the bank", firstWarningAtMillis = tonight)

        thenAlarmScheduledAt(task.id, tonight)

        givenOnline()
        whenSyncRuns()

        val pushed = server.receivedCreates.single()
        assertEquals(java.time.Instant.ofEpochMilli(tonight).toString(), pushed.firstWarningAt)
    }

    @Test
    fun `retrying a create whose response was lost does not duplicate the task on the server`() = scenario {
        server.dropCreateResponses = true
        val task = whenTaskCreated("water plants")
        whenSyncFailsWith { it is java.net.ConnectException }

        server.dropCreateResponses = false
        whenSyncRuns()

        assertEquals("both pushes used the same id", 2, server.receivedCreates.size)
        assertEquals(1, server.openTasks().count { it.title == "water plants" })
        assertFalse(localTask(task.id).pendingCreate)
    }

    @Test
    fun `a new task snapshots the settings it was created under and the push carries them`() = scenario {
        givenLocalSettings(initialDelayMinutes = 30, repeatIntervalMinutes = 5)
        givenOffline()

        val task = whenTaskCreated("water plants")

        assertEquals(30, task.initialDelayMinutes)
        assertEquals(5, task.repeatIntervalMinutes)
        thenAlarmScheduledAt(task.id, task.createdAtMillis + 30 * MINUTE)

        givenOnline()
        whenSyncRuns()

        val pushed = server.receivedCreates.single()
        assertEquals(30, pushed.initialDelayMinutes)
        assertEquals(5, pushed.repeatIntervalMinutes)
    }

    @Test
    fun `a zero first-reminder delay arms the notification immediately`() = scenario {
        givenLocalSettings(initialDelayMinutes = 0, repeatIntervalMinutes = 5)

        val task = whenTaskCreated("urgent task")

        assertEquals(0, task.initialDelayMinutes)
        thenAlarmScheduledAt(task.id, task.createdAtMillis)
    }
}
