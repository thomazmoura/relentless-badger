package com.relentlessbadger.app.ui

import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneId
import java.util.Locale

class FormatDateTimeTest {

    // formatDateTime renders in the system zone, so build the input from a
    // local wall-clock time to keep the expected strings zone-independent.
    private val afternoon = LocalDateTime.of(2026, 7, 17, 15, 5)
        .atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()

    @Before
    fun pinLocale() {
        // The formatters resolve month and AM/PM names from the default
        // locale when first created.
        Locale.setDefault(Locale.US)
    }

    @Test
    fun `12-hour format uses am-pm clock`() {
        assertEquals("Jul 17, 3:05 PM", formatDateTime(afternoon, use24Hour = false))
    }

    @Test
    fun `24-hour format uses zero-padded 24h clock`() {
        assertEquals("Jul 17, 15:05", formatDateTime(afternoon, use24Hour = true))
    }

    @Test
    fun `portuguese puts the day before the month`() {
        assertEquals("17 de jul, 15:05", formatDateTime(afternoon, use24Hour = true, Strings.Portuguese))
    }

    @Test
    fun `portuguese day titles name the weekday in portuguese`() {
        assertEquals(
            "sexta-feira, 17 de jul",
            formatDayTitle(java.time.LocalDate.of(2026, 7, 17), Strings.Portuguese),
        )
    }

    @Test
    fun `durations spell minutes the portuguese way`() {
        assertEquals("45min", formatDuration(45, Strings.Portuguese))
        assertEquals("1h 30min", formatDuration(90, Strings.Portuguese))
        assertEquals("1h 30m", formatDuration(90))
    }

    @Test
    fun `recurrence reads in portuguese`() {
        assertEquals(
            "a cada 3 dias",
            recurrenceLabel(com.relentlessbadger.app.data.Recurrence(3, com.relentlessbadger.app.data.RecurUnit.DAYS, 0), Strings.Portuguese),
        )
    }

    @Test
    fun `reminders are titled with the badger and the task`() {
        assertEquals("Badger: water plants", Strings.English.notificationTitle("water plants"))
        assertEquals("Texugo: regar as plantas", Strings.Portuguese.notificationTitle("regar as plantas"))
    }
}
