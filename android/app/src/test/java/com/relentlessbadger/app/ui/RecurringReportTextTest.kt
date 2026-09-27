package com.relentlessbadger.app.ui

import com.relentlessbadger.app.data.RecurUnit
import com.relentlessbadger.app.data.Recurrence
import com.relentlessbadger.app.data.RecurringCadence
import com.relentlessbadger.app.data.RecurringReport
import com.relentlessbadger.app.data.RecurringReportItem
import com.relentlessbadger.app.data.RecurringReportSection
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneId
import java.util.Locale

class RecurringReportTextTest {

    // The formatters render in the system zone, so build the inputs from local
    // wall-clock times to keep the expected strings zone-independent.
    private fun at(day: Int, hour: Int, minute: Int = 0): Long =
        LocalDateTime.of(2026, 9, day, hour, minute)
            .atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()

    private val pills = RecurringReportItem(
        taskId = "pills",
        title = "Take pills",
        recurrence = Recurrence(1, RecurUnit.DAYS),
        anchorMillis = at(26, 9),
        nextAtMillis = at(26, 9),
        nagging = true,
    )

    private val bins = RecurringReportItem(
        taskId = "bins",
        title = "Put the bins out",
        // Monday and Wednesday.
        recurrence = Recurrence(2, RecurUnit.WEEKS, daysOfWeek = 0b101),
        anchorMillis = at(21, 18, 30),
        nextAtMillis = at(28, 18, 30),
        nagging = false,
    )

    private val bothSections = RecurringReport(
        listOf(
            RecurringReportSection(RecurringCadence(1, RecurUnit.DAYS), listOf(pills)),
            RecurringReportSection(RecurringCadence(2, RecurUnit.WEEKS), listOf(bins)),
        ),
    )

    private val binsOnly = RecurringReport(listOf(RecurringReportSection(RecurringCadence(2, RecurUnit.WEEKS), listOf(bins))))

    @Before
    fun pinLocale() {
        Locale.setDefault(Locale.US)
    }

    @Test
    fun `markdown carries the whatsapp and telegram markers`() {
        val text = renderRecurringReport(bothSections, "Recurring", use24Hour = true, OverviewTextStyle.MARKDOWN)

        assertEquals(
            """
            *RelentlessBadger — Recurring*

            *Daily*
            • Take pills _(every day at 09:00 · nagging since Sep 26, 09:00)_

            *Every 2 weeks*
            • Put the bins out _(every 2 weeks · Mon, Wed at 18:30 · next Sep 28, 18:30)_
            """.trimIndent(),
            text,
        )
    }

    @Test
    fun `plain drops the markers and honours the 12-hour clock`() {
        val text = renderRecurringReport(binsOnly, "Recurring", use24Hour = false, OverviewTextStyle.PLAIN)

        assertEquals(
            """
            RelentlessBadger — Recurring

            Every 2 weeks
            • Put the bins out (every 2 weeks · Mon, Wed at 6:30 PM · next Sep 28, 6:30 PM)
            """.trimIndent(),
            text,
        )
    }

    @Test
    fun `sections are named after their interval`() {
        assertEquals("Daily", cadenceLabel(RecurringCadence(1, RecurUnit.DAYS)))
        assertEquals("Weekly", cadenceLabel(RecurringCadence(1, RecurUnit.WEEKS)))
        assertEquals("Every 4 days", cadenceLabel(RecurringCadence(4, RecurUnit.DAYS)))
        assertEquals("Every 2 weeks", cadenceLabel(RecurringCadence(2, RecurUnit.WEEKS)))
    }

    @Test
    fun `an empty report says so`() {
        val text = renderRecurringReport(RecurringReport(emptyList()), "Recurring", use24Hour = true, OverviewTextStyle.PLAIN)

        assertEquals("RelentlessBadger — Recurring\n\nNo recurring tasks.", text)
    }
}
