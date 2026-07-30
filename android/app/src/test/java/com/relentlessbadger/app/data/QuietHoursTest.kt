package com.relentlessbadger.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneId

class QuietHoursTest {

    private val utc = ZoneId.of("UTC")

    private fun at(hour: Int, minute: Int = 0, day: Int = 5): Long =
        LocalDateTime.of(2026, 3, day, hour, minute).atZone(utc).toInstant().toEpochMilli()

    private fun range(text: String) = parseQuietRange(text)!!

    @Test
    fun `no quiet hours leaves the time alone`() {
        assertEquals(at(2), deferPastQuietHours(at(2), emptyList(), utc))
    }

    @Test
    fun `a time outside the window is left alone`() {
        assertEquals(at(12), deferPastQuietHours(at(12), listOf(range("22:00-07:00")), utc))
    }

    @Test
    fun `a time in the small hours waits for the window to end`() {
        assertEquals(at(7), deferPastQuietHours(at(2), listOf(range("22:00-07:00")), utc))
    }

    @Test
    fun `a time in the evening waits for the next morning`() {
        assertEquals(
            at(7, day = 6),
            deferPastQuietHours(at(23), listOf(range("22:00-07:00")), utc),
        )
    }

    @Test
    fun `the window starts at its start minute`() {
        assertEquals(
            at(7, day = 6),
            deferPastQuietHours(at(22), listOf(range("22:00-07:00")), utc),
        )
    }

    @Test
    fun `the window is over at its end minute`() {
        assertEquals(at(7), deferPastQuietHours(at(7), listOf(range("22:00-07:00")), utc))
    }

    @Test
    fun `a window inside one day holds a time back to its end`() {
        assertEquals(at(14), deferPastQuietHours(at(13), listOf(range("12:30-14:00")), utc))
    }

    @Test
    fun `adjacent windows are cleared in one go`() {
        assertEquals(
            at(9),
            deferPastQuietHours(at(2), listOf(range("22:00-07:00"), range("07:00-09:00")), utc),
        )
    }

    @Test
    fun `overlapping windows release at the later end`() {
        assertEquals(
            at(10, day = 6),
            deferPastQuietHours(at(23), listOf(range("22:00-08:00"), range("06:00-10:00")), utc),
        )
    }

    @Test
    fun `a window that ends inside a spring forward gap releases after it`() {
        // Sao Paulo had no 2018-11-04T00:00: the clock jumped straight to 01:00,
        // so a window ending at midnight can only release an hour later.
        val zone = ZoneId.of("America/Sao_Paulo")
        val beforeMidnight = LocalDateTime.of(2018, 11, 3, 23, 0).atZone(zone).toInstant().toEpochMilli()
        assertEquals(
            LocalDateTime.of(2018, 11, 4, 1, 0).atZone(zone).toInstant().toEpochMilli(),
            deferPastQuietHours(beforeMidnight, listOf(range("22:00-00:00")), zone),
        )
    }

    @Test
    fun `windows survive a round trip through their stored form`() {
        val ranges = listOf(range("22:00-07:00"), range("12:30-14:00"))
        assertEquals("22:00-07:00,12:30-14:00", ranges.toCsv())
        assertEquals(ranges, parseQuietHours(ranges.toCsv()))
    }

    @Test
    fun `nothing stored means no quiet hours`() {
        assertEquals(emptyList<QuietRange>(), parseQuietHours(null))
        assertEquals(emptyList<QuietRange>(), parseQuietHours(""))
    }

    @Test
    fun `a malformed entry costs that window and no more`() {
        assertEquals(
            listOf(range("22:00-07:00")),
            parseQuietHours("22:00-07:00,25:00-07:00,noon-1,12:00"),
        )
    }

    @Test
    fun `a window that starts and ends together is not a window`() {
        assertNull(parseQuietRange("22:00-22:00"))
    }

    @Test
    fun `at most MAX_QUIET_RANGES windows are read back`() {
        val stored = (0 until MAX_QUIET_RANGES + 2).joinToString(",") { "%02d:00-%02d:30".format(it, it) }
        assertEquals(MAX_QUIET_RANGES, parseQuietHours(stored).size)
    }
}
