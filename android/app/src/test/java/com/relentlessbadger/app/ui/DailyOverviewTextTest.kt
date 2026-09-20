package com.relentlessbadger.app.ui

import com.relentlessbadger.app.data.DailyOverview
import com.relentlessbadger.app.data.DailyOverviewItem
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneId
import java.util.Locale

class DailyOverviewTextTest {

    // formatTimeOfDay renders in the system zone, so build the inputs from
    // local wall-clock times to keep the expected strings zone-independent.
    private fun at(hour: Int, minute: Int): Long =
        LocalDateTime.of(2026, 7, 15, hour, minute)
            .atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()

    private fun item(title: String, hour: Int, minute: Int, fromEarlierDay: Boolean = false) =
        DailyOverviewItem(
            taskId = title,
            title = title,
            atMillis = at(hour, minute),
            fromEarlierDay = fromEarlierDay,
            recurring = false,
        )

    private val fullDay = DailyOverview(
        now = listOf(item("Buy milk", 9, 12), item("Call dentist", 11, 40)),
        later = listOf(item("Water plants", 18, 0), item("Take pills", 22, 0)),
    )

    @Before
    fun pinLocale() {
        Locale.setDefault(Locale.US)
    }

    @Test
    fun `markdown carries the whatsapp and telegram markers`() {
        val text = renderDailyOverview(fullDay, use24Hour = true, style = OverviewTextStyle.MARKDOWN)

        assertEquals(
            """
            *RelentlessBadger — Today*

            *Now*
            • Buy milk _(since 09:12)_
            • Call dentist _(since 11:40)_

            *Later today*
            • Water plants _(18:00)_
            • Take pills _(22:00)_
            """.trimIndent(),
            text,
        )
    }

    @Test
    fun `plain is the same text without the markers`() {
        val markdown = renderDailyOverview(fullDay, use24Hour = true, style = OverviewTextStyle.MARKDOWN)
        val plain = renderDailyOverview(fullDay, use24Hour = true, style = OverviewTextStyle.PLAIN)

        assertEquals(markdown.replace("*", "").replace("_", ""), plain)
    }

    @Test
    fun `an empty section is left out entirely`() {
        val laterOnly = DailyOverview(now = emptyList(), later = listOf(item("Water plants", 18, 0)))

        val text = renderDailyOverview(laterOnly, use24Hour = true, style = OverviewTextStyle.MARKDOWN)

        assertEquals(
            """
            *RelentlessBadger — Today*

            *Later today*
            • Water plants _(18:00)_
            """.trimIndent(),
            text,
        )
    }

    @Test
    fun `an empty day says so`() {
        val text = renderDailyOverview(
            DailyOverview(emptyList(), emptyList()),
            use24Hour = true,
            style = OverviewTextStyle.PLAIN,
        )

        assertEquals("RelentlessBadger — Today\n\nNothing scheduled for today.", text)
    }

    @Test
    fun `a nag carried over from an earlier day spells out its date`() {
        val carriedOver = DailyOverview(
            now = listOf(item("Walk the dog", 18, 30, fromEarlierDay = true)),
            later = emptyList(),
        )

        val text = renderDailyOverview(carriedOver, use24Hour = false, style = OverviewTextStyle.PLAIN)

        assertEquals(
            "RelentlessBadger — Today\n\nNow\n• Walk the dog (since Jul 15, 6:30 PM)",
            text,
        )
    }

    @Test
    fun `12-hour rendering uses the am-pm clock`() {
        val text = renderDailyOverview(fullDay, use24Hour = false, style = OverviewTextStyle.PLAIN)

        assertEquals(
            """
            RelentlessBadger — Today

            Now
            • Buy milk (since 9:12 AM)
            • Call dentist (since 11:40 AM)

            Later today
            • Water plants (6:00 PM)
            • Take pills (10:00 PM)
            """.trimIndent(),
            text,
        )
    }
}
