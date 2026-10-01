package com.relentlessbadger.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WaitDurationTest {

    private val second = 1_000L
    private val minute = 60 * second
    private val hour = 60 * minute

    @Test
    fun `minutes alone`() {
        assertEquals(20 * minute, parseWaitDuration("20m"))
        assertEquals(20 * minute, parseWaitDuration("20min"))
    }

    @Test
    fun `a bare number means minutes`() {
        assertEquals(27 * minute, parseWaitDuration("27"))
    }

    @Test
    fun `minutes and seconds, with or without a space`() {
        assertEquals(15 * minute + 45 * second, parseWaitDuration("15m 45s"))
        assertEquals(15 * minute + 45 * second, parseWaitDuration("15m45s"))
    }

    @Test
    fun `every unit together, in any case and with stray spaces`() {
        assertEquals(hour + 5 * minute + 10 * second, parseWaitDuration(" 1H 5 M 10s "))
    }

    @Test
    fun `seconds alone may exceed a minute`() {
        assertEquals(90 * second, parseWaitDuration("90s"))
    }

    @Test
    fun `nothing, garbage or a number without its unit is not a wait`() {
        assertNull(parseWaitDuration(""))
        assertNull(parseWaitDuration("   "))
        assertNull(parseWaitDuration("soon"))
        assertNull(parseWaitDuration("1h30"))
        assertNull(parseWaitDuration("-5m"))
        assertNull(parseWaitDuration("1.5h"))
    }

    @Test
    fun `units out of order or repeated are rejected rather than guessed at`() {
        assertNull(parseWaitDuration("45s 15m"))
        assertNull(parseWaitDuration("5m 5m"))
    }

    @Test
    fun `a zero wait is rejected because it would fire at once`() {
        assertNull(parseWaitDuration("0"))
        assertNull(parseWaitDuration("0m 0s"))
    }
}
