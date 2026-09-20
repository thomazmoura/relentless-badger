package com.relentlessbadger.app.scenario

import com.relentlessbadger.app.data.OverviewSectionKind
import com.relentlessbadger.app.data.buildDailyOverview
import com.relentlessbadger.app.scenario.BadgerScenario.Companion.MINUTE
import com.relentlessbadger.app.scenario.BadgerScenario.Companion.SCENARIO_ZONE
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

/**
 * The day overview read back through the real stores: what a past day left
 * behind, and what it closed. The digest is a view over the same two tables the
 * task list and the calendar read, so whatever the repository wrote is what the
 * day reports — offline included.
 */
class DayOverviewScenarios : ScenarioTest() {

    /** The local date [millis] falls on, as the overview buckets by. */
    private fun dateOf(millis: Long) =
        Instant.ofEpochMilli(millis).atZone(SCENARIO_ZONE).toLocalDate()

    @Test
    fun `a task completed on an earlier day is reported as that day's work`() = scenario {
        val task = givenSyncedTask("water plants")
        val completedAt = clock.now()
        whenTaskCompleted(task.id)

        // Two days on, looking back at the day it was closed.
        whenTimeAdvancesMinutes(2 * 24 * 60)
        val overview = buildDailyOverview(
            openTasks = taskDao.getActive(),
            completed = completedCache(),
            date = dateOf(completedAt),
            nowMillis = clock.now(),
            includeConcluded = true,
            zone = SCENARIO_ZONE,
        )

        assertEquals(
            listOf(OverviewSectionKind.DONE),
            overview.sections.map { it.kind },
        )
        assertEquals(listOf("water plants"), overview.sections.single().items.map { it.title })
    }

    @Test
    fun `a task left unfinished is reported as the day it was due being overdue`() = scenario {
        val dueAt = clock.now() + 30 * MINUTE
        whenTaskCreated("renew passport", firstWarningAtMillis = dueAt)

        whenTimeAdvancesMinutes(2 * 24 * 60)
        val overview = buildDailyOverview(
            openTasks = taskDao.getActive(),
            completed = completedCache(),
            date = dateOf(dueAt),
            nowMillis = clock.now(),
            includeConcluded = true,
            zone = SCENARIO_ZONE,
        )

        assertEquals(
            listOf(OverviewSectionKind.OVERDUE),
            overview.sections.map { it.kind },
        )
        assertEquals(dueAt, overview.sections.single().items.single().atMillis)
    }

    @Test
    fun `a cancelled task is neither owed nor done`() = scenario {
        val task = givenSyncedTask("water plants")
        val cancelledAt = clock.now()
        whenTaskCancelled(task.id)

        whenTimeAdvancesMinutes(2 * 24 * 60)
        val overview = buildDailyOverview(
            openTasks = taskDao.getActive(),
            completed = completedCache(),
            date = dateOf(cancelledAt),
            nowMillis = clock.now(),
            includeConcluded = true,
            zone = SCENARIO_ZONE,
        )

        assertTrue("a cancellation is the calendar's business", overview.isEmpty)
    }

    @Test
    fun `undoing a conclusion puts the task back on the day it is owed`() = scenario {
        val task = givenSyncedTask("water plants")
        val dueAt = localTask(task.id).firstWarningAtMillis ?: clock.now()
        val concluded = whenTaskCompleted(task.id)!!

        whenConclusionUndone(concluded)

        val overview = buildDailyOverview(
            openTasks = taskDao.getActive(),
            completed = completedCache(),
            date = dateOf(dueAt),
            nowMillis = clock.now(),
            includeConcluded = true,
            zone = SCENARIO_ZONE,
        )

        assertEquals(
            "the completion is forgotten, so only the open task remains",
            listOf("water plants"),
            overview.sections.single().items.map { it.title },
        )
    }
}
