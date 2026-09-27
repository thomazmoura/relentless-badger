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

    @Test
    fun `one-off tasks are left out`() {
        val report = buildRecurringReport(
            listOf(
                openTask("once", at(2026, 7, 16, 9), recurrence = null),
                openTask("daily", at(2026, 7, 16, 9), daily),
            ),
            now,
        )

        assertEquals(listOf("daily"), report.map { it.taskId })
    }

    @Test
    fun `series are listed soonest first`() {
        val report = buildRecurringReport(
            listOf(
                openTask("weekly", at(2026, 7, 20, 8), Recurrence(1, RecurUnit.WEEKS, daysOfWeek = 1)),
                openTask("daily", at(2026, 7, 16, 9), daily),
            ),
            now,
        )

        assertEquals(listOf("daily", "weekly"), report.map { it.taskId })
    }

    @Test
    fun `an upcoming occurrence is next, not nagging`() {
        val nextAt = at(2026, 7, 16, 9)
        val item = buildRecurringReport(listOf(openTask("daily", nextAt, daily)), now).single()

        assertFalse(item.nagging)
        assertEquals(nextAt, item.nextAtMillis)
        assertEquals(daily, item.recurrence)
    }

    @Test
    fun `an occurrence that has begun is reported as nagging`() {
        val startedAt = at(2026, 7, 15, 9)
        val item = buildRecurringReport(listOf(openTask("daily", startedAt, daily)), now).single()

        assertTrue(item.nagging)
        assertEquals(startedAt, item.nextAtMillis)
    }

    @Test
    fun `the hour comes from the series anchor`() {
        val anchor = at(2026, 7, 16, 18, 30)
        val item = buildRecurringReport(listOf(openTask("daily", anchor, daily)), now).single()

        assertEquals(anchor, item.anchorMillis)
    }
}
