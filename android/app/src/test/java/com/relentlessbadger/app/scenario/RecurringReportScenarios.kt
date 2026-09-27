package com.relentlessbadger.app.scenario

import com.relentlessbadger.app.data.RecurUnit
import com.relentlessbadger.app.data.Recurrence
import com.relentlessbadger.app.data.buildRecurringReport
import com.relentlessbadger.app.scenario.BadgerScenario.Companion.MINUTE
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The recurring report read back through the real stores. It is a view over the
 * open tasks, so whatever occurrence the repository spawned is the one the
 * report calls next.
 */
class RecurringReportScenarios : ScenarioTest() {

    private val daily = Recurrence(1, RecurUnit.DAYS)

    @Test
    fun `completing an occurrence reports the one it spawned as next`() = scenario {
        val firstAt = clock.now() + 9 * 60 * MINUTE
        val task = whenTaskCreated("take pills", firstWarningAtMillis = firstAt, recurrence = daily)

        whenTimeAdvancesMinutes(9 * 60 + 5)
        whenTaskCompleted(task.id)
        val item = buildRecurringReport(taskDao.getActive(), clock.now()).sections.single().items.single()

        assertEquals("take pills", item.title)
        assertEquals(firstAt + 24 * 60 * MINUTE, item.nextAtMillis)
        assertFalse(item.nagging)
    }

    @Test
    fun `an occurrence left open is reported as nagging`() = scenario {
        val firstAt = clock.now() + 30 * MINUTE
        whenTaskCreated("take pills", firstWarningAtMillis = firstAt, recurrence = daily)

        whenTimeAdvancesMinutes(45)
        val item = buildRecurringReport(taskDao.getActive(), clock.now()).sections.single().items.single()

        assertTrue(item.nagging)
        assertEquals(firstAt, item.nextAtMillis)
    }

    @Test
    fun `a one-off task stays out of the report`() = scenario {
        whenTaskCreated("renew passport", firstWarningAtMillis = clock.now() + 30 * MINUTE)

        assertTrue(buildRecurringReport(taskDao.getActive(), clock.now()).isEmpty)
    }

    @Test
    fun `cancelling an occurrence skips the report to the next one`() = scenario {
        val firstAt = clock.now() + 30 * MINUTE
        val task = whenTaskCreated("take pills", firstWarningAtMillis = firstAt, recurrence = daily)

        whenTaskCancelled(task.id)
        val item = buildRecurringReport(taskDao.getActive(), clock.now()).sections.single().items.single()

        assertEquals(firstAt + 24 * 60 * MINUTE, item.nextAtMillis)
    }
}
