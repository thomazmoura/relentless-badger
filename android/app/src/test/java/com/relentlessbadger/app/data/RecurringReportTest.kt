package com.relentlessbadger.app.data

import com.relentlessbadger.app.db.OpenTaskEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneId

class RecurringReportTest {

    private val zone = ZoneId.of("America/New_York")

    /** Noon on a Wednesday. */
    private val now = at(2026, 7, 15, 12, 0)

    private fun at(year: Int, month: Int, day: Int, hour: Int, minute: Int = 0): Long =
        LocalDateTime.of(year, month, day, hour, minute).atZone(zone).toInstant().toEpochMilli()

    private fun openTask(
        id: String,
        firstWarningAtMillis: Long?,
        recurrence: Recurrence?,
        createdAtMillis: Long = now,
    ) = OpenTaskEntity(
        id = id,
        title = id,
        createdAtMillis = createdAtMillis,
        initialDelayMinutes = 60,
        repeatIntervalMinutes = 15,
        firstWarningAtMillis = firstWarningAtMillis,
        nextFireAtMillis = firstWarningAtMillis ?: createdAtMillis,
        recurEveryN = recurrence?.everyN,
        recurUnit = recurrence?.unit?.wire(),
        recurDaysOfWeek = recurrence?.takeIf { it.unit == RecurUnit.WEEKS }?.daysOfWeek,
        seriesId = recurrence?.let { id },
    )

    private val daily = Recurrence(1, RecurUnit.DAYS)

    private fun RecurringReport.items() = sections.flatMap { it.items }

    @Test
    fun `one-off tasks are left out`() {
        val report = buildRecurringReport(
            listOf(
                openTask("once", at(2026, 7, 16, 9), recurrence = null),
                openTask("daily", at(2026, 7, 16, 9), daily),
            ),
            now,
        )

        assertEquals(listOf("daily"), report.items().map { it.taskId })
    }

    @Test
    fun `series are listed soonest first within a section`() {
        val report = buildRecurringReport(
            listOf(
                openTask("evening", at(2026, 7, 15, 20), daily),
                openTask("morning", at(2026, 7, 16, 9), daily),
                openTask("afternoon", at(2026, 7, 15, 15), daily),
            ),
            now,
        )

        assertEquals(listOf("afternoon", "evening", "morning"), report.items().map { it.taskId })
    }

    @Test
    fun `daily series lead, then weekly, then any other interval`() {
        val report = buildRecurringReport(
            listOf(
                // The sooner fire does not pull a less regular series ahead.
                openTask("every 4 days", at(2026, 7, 15, 13), Recurrence(4, RecurUnit.DAYS)),
                openTask("every 2 weeks", at(2026, 7, 15, 14), Recurrence(2, RecurUnit.WEEKS, daysOfWeek = 1)),
                openTask("weekly", at(2026, 7, 20, 8), Recurrence(1, RecurUnit.WEEKS, daysOfWeek = 1)),
                openTask("daily", at(2026, 7, 16, 9), daily),
            ),
            now,
        )

        assertEquals(
            listOf(RecurringCadence.DAILY, RecurringCadence.WEEKLY, RecurringCadence.OTHER),
            report.sections.map { it.cadence },
        )
        assertEquals(
            listOf(listOf("daily"), listOf("weekly"), listOf("every 4 days", "every 2 weeks")),
            report.sections.map { section -> section.items.map { it.taskId } },
        )
    }

    @Test
    fun `a cadence with no series gets no section`() {
        val report = buildRecurringReport(
            listOf(openTask("every 3 days", at(2026, 7, 16, 9), Recurrence(3, RecurUnit.DAYS))),
            now,
        )

        assertEquals(listOf(RecurringCadence.OTHER), report.sections.map { it.cadence })
    }

    @Test
    fun `an upcoming occurrence is next, not nagging`() {
        val nextAt = at(2026, 7, 16, 9)
        val item = buildRecurringReport(listOf(openTask("daily", nextAt, daily)), now).items().single()

        assertFalse(item.nagging)
        assertEquals(nextAt, item.nextAtMillis)
        assertEquals(daily, item.recurrence)
    }

    @Test
    fun `an occurrence that has begun is reported as nagging`() {
        val startedAt = at(2026, 7, 15, 9)
        val item = buildRecurringReport(listOf(openTask("daily", startedAt, daily)), now).items().single()

        assertTrue(item.nagging)
        assertEquals(startedAt, item.nextAtMillis)
    }

    @Test
    fun `the hour comes from the series anchor`() {
        val anchor = at(2026, 7, 16, 18, 30)
        val item = buildRecurringReport(listOf(openTask("daily", anchor, daily)), now).items().single()

        assertEquals(anchor, item.anchorMillis)
    }
}
