package com.relentlessbadger.app.scenario

import com.relentlessbadger.app.data.ConcludedTask
import com.relentlessbadger.app.data.Recurrence
import com.relentlessbadger.app.data.RecurUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UndoConclusionScenarios : ScenarioTest() {

    private val daily = Recurrence(1, RecurUnit.DAYS)
    private val day = 24 * 60 * BadgerScenario.MINUTE

    @Test
    fun `undoing a completion before it is pushed brings the task back, nagging`() = scenario {
        val task = givenSyncedTask("water plants")
        givenOffline()

        val concluded = whenTaskCompleted(task.id)!!
        thenTaskGone("water plants")

        whenConclusionUndone(concluded)

        thenTaskVisible("water plants")
        thenNoCompletionCached("water plants")
        assertNotNull("the task is armed again", alarms.scheduled[task.id])
        assertFalse("no longer waiting to be pushed as done", localTask(task.id).pendingDone)
        thenNothingPushed()
    }

    @Test
    fun `undoing a cancellation restores the task the same way`() = scenario {
        val task = givenSyncedTask("water plants")
        givenOffline()

        val concluded = whenTaskCancelled(task.id)!!
        assertTrue("the receipt remembers how it was closed", concluded.cancelled)

        whenConclusionUndone(concluded)

        thenTaskVisible("water plants")
        thenNoCompletionCached("water plants")
        assertNotNull(alarms.scheduled[task.id])
    }

    @Test
    fun `undoing after the completion was pushed reopens the task on the server`() = scenario {
        val task = givenSyncedTask("water plants")

        val concluded = whenTaskCompleted(task.id)!!
        whenSyncRuns()
        assertNull("the flush deleted the local row", taskDao.getById(task.id))

        whenConclusionUndone(concluded)

        // Back immediately, without waiting for the server to be told.
        thenTaskVisible("water plants")
        assertTrue("queued for the server", localTask(task.id).pendingReopen)

        whenSyncRuns()

        assertEquals(listOf(task.id), server.receivedReopens)
        thenServerHasOpenTask("water plants")
        assertFalse("flag cleared once acknowledged", localTask(task.id).pendingReopen)
        thenNoCompletionCached("water plants")
    }

    @Test
    fun `undo restores the task's own schedule, not a fresh one`() = scenario {
        val startAt = clock.now() + 60 * BadgerScenario.MINUTE
        val task = whenTaskCreated("water plants", startAt)
        whenSyncRuns()

        val concluded = whenTaskCompleted(task.id)!!
        whenSyncRuns()
        whenConclusionUndone(concluded)

        val restored = localTask(task.id)
        assertEquals(task.createdAtMillis, restored.createdAtMillis)
        assertEquals(task.firstWarningAtMillis, restored.firstWarningAtMillis)
        assertEquals(task.initialDelayMinutes, restored.initialDelayMinutes)
        assertEquals(task.repeatIntervalMinutes, restored.repeatIntervalMinutes)
        assertEquals(task.recurEveryN, restored.recurEveryN)
        assertEquals(task.seriesId, restored.seriesId)
    }

    @Test
    fun `a wait set before concluding survives the undo`() = scenario {
        val task = givenSyncedTask("water plants")
        val waitUntil = clock.now() + 180 * BadgerScenario.MINUTE
        whenSnoozedUntil(task.id, waitUntil)

        val concluded = whenTaskCompleted(task.id)!!
        whenConclusionUndone(concluded)

        thenAlarmScheduledAt(task.id, waitUntil)
    }

    @Test
    fun `a fire time the clock ran past while the snackbar was up is recomputed`() = scenario {
        val task = givenSyncedTask("water plants")
        val concluded = whenTaskCompleted(task.id)!!

        whenTimeAdvancesMinutes(600) // long past the fire time it was carrying

        whenConclusionUndone(concluded)

        val restored = localTask(task.id)
        assertTrue(
            "restored with a fire time ahead, not one that nags instantly",
            restored.nextFireAtMillis > clock.now(),
        )
        thenAlarmScheduledAt(task.id, restored.nextFireAtMillis)
    }

    @Test
    fun `undoing a backdated completion forgets the record at the backdated time`() = scenario {
        val task = givenSyncedTask("water plants")
        val doneAt = clock.now()
        whenTimeAdvancesMinutes(300)

        val concluded = whenTaskCompleted(task.id, atMillis = doneAt)!!
        assertEquals(doneAt, concluded.completedAtMillis)

        whenConclusionUndone(concluded)

        thenNoCompletionCached("water plants")
        thenTaskVisible("water plants")
    }

    @Test
    fun `undoing a recurring completion takes back the occurrence it spawned`() = scenario {
        givenOffline()
        val startAt = clock.now() + 60 * BadgerScenario.MINUTE
        val task = whenTaskCreated("water plants", startAt, daily)
        whenTimeAdvancesMinutes(90)

        val concluded = whenTaskCompleted(task.id)!!
        val spawnedId = concluded.spawnedId!!
        assertNotNull("the spawn exists before the undo", taskDao.getById(spawnedId))

        whenConclusionUndone(concluded)

        assertNull("the spawn is gone", taskDao.getById(spawnedId))
        assertTrue("its alarm was cancelled", alarms.cancelled.contains(spawnedId))
        assertEquals(listOf("water plants"), openTaskTitles())
        assertEquals(listOf(task.id), taskDao.getActive().map { it.id })
    }

    @Test
    fun `undoing a recurring completion deletes a spawn the server already knows`() = scenario {
        val startAt = clock.now() + 60 * BadgerScenario.MINUTE
        val task = whenTaskCreated("water plants", startAt, daily)
        whenSyncRuns()
        whenTimeAdvancesMinutes(90)

        val concluded = whenTaskCompleted(task.id)!!
        whenSyncRuns() // pushes the spawn's create
        val spawnedId = concluded.spawnedId!!
        assertFalse("the server has it", localTask(spawnedId).pendingCreate)

        whenConclusionUndone(concluded)

        // Hidden at once, even though the server hasn't been told yet.
        assertEquals(listOf("water plants"), openTaskTitles())
        assertEquals(listOf(task.id), taskDao.getActive().map { it.id })

        whenSyncRuns()

        assertEquals(listOf(spawnedId), server.receivedDeletes)
        assertNull("row dropped once the server agreed", taskDao.getById(spawnedId))
    }

    @Test
    fun `a revoked spawn stays hidden and unarmed while its delete is pending`() = scenario {
        val startAt = clock.now() + 60 * BadgerScenario.MINUTE
        val task = whenTaskCreated("water plants", startAt, daily)
        whenSyncRuns()
        whenTimeAdvancesMinutes(90)
        val concluded = whenTaskCompleted(task.id)!!
        whenSyncRuns()

        givenOffline()
        whenConclusionUndone(concluded)
        whenBootReArmRuns()

        val spawnedId = concluded.spawnedId!!
        assertNull("a revoked occurrence is never re-armed", alarms.scheduled[spawnedId])
        assertFalse(openTaskTitles().contains("water plants") && taskDao.getActive().size > 1)
    }

    @Test
    fun `an occurrence the user has already acted on is left alone`() = scenario {
        givenOffline()
        val startAt = clock.now() + 60 * BadgerScenario.MINUTE
        val task = whenTaskCreated("water plants", startAt, daily)
        whenTimeAdvancesMinutes(90)
        val concluded = whenTaskCompleted(task.id)!!
        val spawnedId = concluded.spawnedId!!

        // The user got ahead and did the next one too.
        whenTaskCompleted(spawnedId)

        whenConclusionUndone(concluded)

        thenCompletionCached("water plants")
        assertNotNull("the occurrence they acted on survives", taskDao.getById(spawnedId))
    }

    @Test
    fun `a pull before the reopen is pushed does not resurrect the completion`() = scenario {
        val task = givenSyncedTask("water plants")
        val concluded = whenTaskCompleted(task.id)!!
        whenSyncRuns()

        whenConclusionUndone(concluded)
        server.failTaskPull = false
        whenSyncRuns()

        // The reopen went first, so the done list no longer carries it.
        thenNoCompletionCached("water plants")
        thenTaskVisible("water plants")
    }

    @Test
    fun `a reopen the server knows nothing about is dropped instead of retried forever`() = scenario {
        val task = givenSyncedTask("water plants")
        val concluded = whenTaskCompleted(task.id)!!
        whenSyncRuns()
        server.tasks.remove(task.id) // deleted from another device

        whenConclusionUndone(concluded)
        whenSyncRuns()

        // There is no conclusion left to undo, and the pull prunes a task the
        // server no longer has — the deletion elsewhere wins, as it does for a
        // completion the server has forgotten.
        assertNull("row pruned by the pull", taskDao.getById(task.id))
        server.receivedReopens.clear()
        whenSyncRuns()
        assertTrue("no reopen retries", server.receivedReopens.isEmpty())
    }

    @Test
    fun `undoing a task created and concluded offline leaves a plain pending create`() = scenario {
        givenOffline()
        val task = whenTaskCreated("water plants")
        val concluded = whenTaskCompleted(task.id)!!

        whenConclusionUndone(concluded)

        givenOnline()
        whenSyncRuns()

        assertEquals(listOf(task.id), server.receivedCreates.map { it.id })
        assertTrue("nothing to undo on the server", server.receivedCompletions.isEmpty())
        thenServerHasOpenTask("water plants")
        thenTaskVisible("water plants")
    }

    @Test
    fun `concluding again after an undo closes the task at the later moment`() = scenario {
        val task = givenSyncedTask("water plants")
        val concluded = whenTaskCompleted(task.id)!!
        whenSyncRuns()
        whenConclusionUndone(concluded)

        whenTimeAdvancesMinutes(120)
        val closedAgain = clock.now()
        whenTaskCompleted(task.id)
        whenSyncRuns()

        // The reopen is pushed before the completion, so the server's idempotent
        // complete records the new moment rather than keeping the undone one.
        assertEquals(listOf(task.id), server.receivedReopens)
        assertEquals(
            java.time.Instant.ofEpochMilli(closedAgain).toString(),
            server.tasks[task.id]?.completedAt,
        )
    }

    @Test
    fun `undoing the same conclusion twice is harmless`() = scenario {
        val task = givenSyncedTask("water plants")
        val concluded: ConcludedTask = whenTaskCompleted(task.id)!!

        whenConclusionUndone(concluded)
        whenConclusionUndone(concluded)

        thenTaskVisible("water plants")
        assertEquals(1, taskDao.getActive().size)
    }
}
