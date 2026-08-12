package com.relentlessbadger.app.scenario

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class CompleteTaskScenarios : ScenarioTest() {

    @Test
    fun `disabling a task online hides it, cancels its alarm and pushes the completion`() = scenario {
        val task = givenSyncedTask("water plants")

        whenTaskCompleted(task.id)

        thenTaskGone("water plants")
        assertTrue(alarms.cancelled.contains(task.id))

        whenSyncRuns()

        assertEquals(listOf(task.id), server.receivedCompletions)
        thenServerDoesNotHaveOpenTask("water plants")
        assertNull("row removed once acknowledged", taskDao.getById(task.id))
    }

    @Test
    fun `disabling a task offline takes effect immediately and is pushed when connectivity returns`() = scenario {
        val task = givenSyncedTask("water plants")
        givenOffline()

        whenTaskCompleted(task.id)

        thenTaskGone("water plants")
        assertTrue(alarms.cancelled.contains(task.id))
        assertTrue(server.receivedCompletions.isEmpty())

        givenOnline()
        whenSyncRuns()

        assertEquals(listOf(task.id), server.receivedCompletions)
        thenServerDoesNotHaveOpenTask("water plants")
    }

    @Test
    fun `a completion the server no longer knows about is dropped instead of retried forever`() = scenario {
        val task = givenSyncedTask("water plants")
        server.tasks.remove(task.id) // deleted from another device

        whenTaskCompleted(task.id)
        whenSyncRuns()

        assertNull("row removed after the 404", taskDao.getById(task.id))
        whenSyncRuns()
        assertTrue("no completion retries", server.receivedCompletions.isEmpty())
    }

    @Test
    fun `a completion that fails on a dead network stays queued and a later sync flushes it`() = scenario {
        val task = givenSyncedTask("water plants")

        whenTaskCompleted(task.id)
        givenOffline()
        whenSyncFailsWith { it is java.net.ConnectException }

        assertTrue("still queued", localTask(task.id).pendingDone)

        givenOnline()
        whenSyncRuns()

        assertEquals(listOf(task.id), server.receivedCompletions)
        assertNull(taskDao.getById(task.id))
    }

    @Test
    fun `a completion pushed by a later sync keeps the time the task was completed, not the sync time`() = scenario {
        val task = givenSyncedTask("water plants")
        givenOffline()

        whenTaskCompleted(task.id)
        val completedAtMillis = clock.now()

        whenTimeAdvancesMinutes(90)
        givenOnline()
        whenSyncRuns()

        assertEquals(
            "server records the local completion time",
            Instant.ofEpochMilli(completedAtMillis).toString(),
            server.tasks[task.id]?.completedAt,
        )
    }

    @Test
    fun `marking a task done previously credits it at the chosen moment, not now`() = scenario {
        val task = givenSyncedTask("water plants")
        val doneAt = clock.now()
        whenTimeAdvancesMinutes(300) // remembered to tap the check five hours later

        whenTaskCompleted(task.id, atMillis = doneAt)

        thenTaskGone("water plants")
        thenCompletionCached("water plants", atMillis = doneAt, cancelled = false)

        whenSyncRuns()

        assertEquals(
            "server records the backdated completion",
            Instant.ofEpochMilli(doneAt).toString(),
            server.tasks[task.id]?.completedAt,
        )
    }

    @Test
    fun `a completion backdated before the task existed is clamped to its creation`() = scenario {
        val task = whenTaskCreated("water plants")

        whenTaskCompleted(task.id, atMillis = task.createdAtMillis - 7 * 24 * 60 * BadgerScenario.MINUTE)

        thenCompletionCached("water plants", atMillis = task.createdAtMillis)
    }

    @Test
    fun `a completion dated in the future is clamped to now`() = scenario {
        val task = givenSyncedTask("water plants")

        whenTaskCompleted(task.id, atMillis = clock.now() + 24 * 60 * BadgerScenario.MINUTE)

        thenCompletionCached("water plants", atMillis = clock.now())
    }

    @Test
    fun `completing without a moment still stamps the completion now`() = scenario {
        val task = givenSyncedTask("water plants")

        whenTaskCompleted(task.id)

        thenCompletionCached("water plants", atMillis = clock.now())
    }

    @Test
    fun `a task created and completed entirely offline reaches the server as a completed task`() = scenario {
        givenOffline()

        val task = whenTaskCreated("water plants")
        whenTaskCompleted(task.id)
        thenTaskGone("water plants")

        givenOnline()
        whenSyncRuns()

        assertEquals("create pushed before the completion", task.id, server.receivedCreates.single().id)
        assertEquals(listOf(task.id), server.receivedCompletions)
        assertTrue(
            "server has the task, completed",
            server.tasks[task.id]?.completedAt != null,
        )
    }
}
