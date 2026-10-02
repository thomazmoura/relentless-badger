package com.relentlessbadger.app.scenario

import com.relentlessbadger.app.data.Recurrence
import com.relentlessbadger.app.data.RecurUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

/** Marking several things done at one earlier moment, from the main list's top bar. */
class DoneEarlierScenarios : ScenarioTest() {

    private val day = 24 * 60 * BadgerScenario.MINUTE

    private fun iso(millis: Long) = Instant.ofEpochMilli(millis).toString()

    @Test
    fun `the candidates are the tasks open then and the recent completions that were done`() = scenario {
        val start = clock.now()
        givenServerHasCompletedTask("stretch", completedAtMillis = start)
        givenServerHasCompletedTask("gym", completedAtMillis = start, cancelled = true)
        givenServerHasCompletedTask("old chore", completedAtMillis = start - 3 * day)
        givenSyncedTask("water plants")
        whenTimeAdvancesMinutes(600)
        whenTaskCreated("call mom") // didn't exist yet at the moment being picked

        val candidates = repository.doneEarlierCandidates(start + 60 * BadgerScenario.MINUTE)

        assertEquals(listOf("water plants"), candidates.open.map { it.title })
        assertEquals(
            "cancelled and long-past completions are left out",
            listOf("stretch"),
            candidates.completed.map { it.title },
        )
    }

    @Test
    fun `marking open tasks done earlier credits each at the moment, and a recurring one still recurs`() =
        scenario {
            val doneAt = clock.now()
            val plants = givenSyncedTask("water plants")
            val pills = whenTaskCreated("take pills", doneAt, Recurrence(1, RecurUnit.DAYS))
            whenTimeAdvancesMinutes(600) // remembered the next morning

            val batch = whenMarkedDoneAt(doneAt, openIds = listOf(plants.id, pills.id))

            assertEquals(2, batch.count)
            thenTaskGone("water plants")
            thenCompletionCached("water plants", atMillis = doneAt, cancelled = false)
            thenCompletionCached("take pills", atMillis = doneAt, cancelled = false)
            assertTrue(
                "the next pills occurrence was spawned",
                taskDao.getActive().single { it.title == "take pills" }.firstWarningAtMillis!! > clock.now(),
            )

            whenSyncRuns()

            assertEquals(iso(doneAt), server.tasks[plants.id]?.completedAt)
            assertEquals(iso(doneAt), server.tasks[pills.id]?.completedAt)
        }

    @Test
    fun `moving a pushed completion re-dates it locally and on the server`() = scenario {
        val doneAt = clock.now()
        val task = givenSyncedTask("water plants")
        whenTimeAdvancesMinutes(600)
        whenTaskCompleted(task.id) // tapped late, stamped now
        whenSyncRuns()

        whenMarkedDoneAt(doneAt, completedIds = listOf(task.id))

        thenCompletionCached("water plants", atMillis = doneAt)
        whenSyncRuns()

        assertEquals(iso(doneAt), server.tasks[task.id]?.completedAt)
        assertFalse(
            "nothing left to push",
            completedDao.getById(task.id)!!.pendingRetime,
        )
    }

    @Test
    fun `moving a completion that never reached the server sends it at the new moment`() = scenario {
        val doneAt = clock.now()
        val task = givenSyncedTask("water plants")
        givenOffline()
        whenTimeAdvancesMinutes(600)
        whenTaskCompleted(task.id)

        whenMarkedDoneAt(doneAt, completedIds = listOf(task.id))
        givenOnline()
        whenSyncRuns()

        assertEquals(iso(doneAt), server.tasks[task.id]?.completedAt)
        thenCompletionCached("water plants", atMillis = doneAt)
    }

    @Test
    fun `a move the server can't take yet survives the pull and is pushed later`() = scenario {
        val doneAt = clock.now()
        val task = givenSyncedTask("water plants")
        whenTimeAdvancesMinutes(600)
        whenTaskCompleted(task.id)
        whenSyncRuns()
        val stampedAt = clock.now()

        server.failRetimesWithServerError = true
        whenMarkedDoneAt(doneAt, completedIds = listOf(task.id))
        whenSyncRuns()

        assertEquals("the server still has the old moment", iso(stampedAt), server.tasks[task.id]?.completedAt)
        thenCompletionCached("water plants", atMillis = doneAt)

        server.failRetimesWithServerError = false
        whenSyncRuns()

        assertEquals(iso(doneAt), server.tasks[task.id]?.completedAt)
    }

    @Test
    fun `a completion moved on another device is adopted on the next sync`() = scenario {
        val task = givenSyncedTask("water plants")
        whenTimeAdvancesMinutes(600)
        whenTaskCompleted(task.id)
        whenSyncRuns()

        val movedElsewhere = clock.now() - 300 * BadgerScenario.MINUTE
        server.tasks[task.id] = server.tasks[task.id]!!.copy(completedAt = iso(movedElsewhere))
        whenSyncRuns()

        thenCompletionCached("water plants", atMillis = movedElsewhere)
    }

    @Test
    fun `a move the server rejects is dropped rather than retried forever`() = scenario {
        val task = givenSyncedTask("water plants")
        whenTimeAdvancesMinutes(600)
        whenTaskCompleted(task.id)
        whenSyncRuns()
        // Reopened on another device: there is no completion left to move.
        server.tasks[task.id] = server.tasks[task.id]!!.copy(completedAt = null)

        whenMarkedDoneAt(clock.now() - 60 * BadgerScenario.MINUTE, completedIds = listOf(task.id))
        whenSyncRuns()
        whenSyncRuns()

        assertTrue(server.receivedRetimes.isEmpty())
        assertTrue("no move left waiting", completedDao.getPendingRetime().isEmpty())
        thenTaskVisible("water plants")
    }

    @Test
    fun `undoing the batch reopens what it closed and puts moved completions back`() = scenario {
        val doneAt = clock.now()
        val plants = givenSyncedTask("water plants")
        val trash = givenSyncedTask("take out trash")
        whenTimeAdvancesMinutes(600)
        whenTaskCompleted(trash.id)
        whenSyncRuns()
        val trashStampedAt = clock.now()

        val batch = whenMarkedDoneAt(doneAt, openIds = listOf(plants.id), completedIds = listOf(trash.id))
        whenBatchUndone(batch)

        thenTaskVisible("water plants")
        thenNoCompletionCached("water plants")
        thenCompletionCached("take out trash", atMillis = trashStampedAt)

        whenSyncRuns()

        assertNull("plants is open on the server", server.tasks[plants.id]?.completedAt)
        assertEquals(iso(trashStampedAt), server.tasks[trash.id]?.completedAt)
    }
}
