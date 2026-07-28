package com.relentlessbadger.app.data

import org.junit.Assert.assertEquals
import org.junit.Test

class NotificationPauseTest {

    private val noon = 1_767_268_800_000L
    private val hour = 3_600_000L

    @Test
    fun `with no pause the time is left alone`() {
        assertEquals(noon, deferPastPause(noon, null))
    }

    @Test
    fun `a time inside the pause is pushed to its end`() {
        assertEquals(noon + hour, deferPastPause(noon, noon + hour))
    }

    @Test
    fun `a time after the pause is left alone`() {
        assertEquals(noon + 2 * hour, deferPastPause(noon + 2 * hour, noon + hour))
    }

    @Test
    fun `a time exactly at the end of the pause is left alone`() {
        assertEquals(noon + hour, deferPastPause(noon + hour, noon + hour))
    }

    @Test
    fun `an expired pause behaves like no pause at all`() {
        assertEquals(noon, deferPastPause(noon, noon - hour))
    }
}
