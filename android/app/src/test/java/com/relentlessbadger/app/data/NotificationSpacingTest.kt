package com.relentlessbadger.app.data

import org.junit.Assert.assertEquals
import org.junit.Test

class NotificationSpacingTest {

    private val now = 1_000_000L

    @Test
    fun `a gap of zero never delays anything`() {
        assertEquals(now, nextNotificationSlot(now, lastShownAtMillis = now, gapSeconds = 0))
    }

    @Test
    fun `a negative gap is treated as no spacing rather than time travel`() {
        assertEquals(now, nextNotificationSlot(now, lastShownAtMillis = now, gapSeconds = -5))
    }

    @Test
    fun `the first ever notification goes out immediately`() {
        assertEquals(now, nextNotificationSlot(now, lastShownAtMillis = null, gapSeconds = 5))
    }

    @Test
    fun `a notification inside the gap waits for the end of it`() {
        assertEquals(
            now + 3_000L,
            nextNotificationSlot(now, lastShownAtMillis = now - 2_000L, gapSeconds = 5),
        )
    }

    @Test
    fun `exactly one gap later counts as elapsed`() {
        assertEquals(
            now,
            nextNotificationSlot(now, lastShownAtMillis = now - 5_000L, gapSeconds = 5),
        )
    }

    @Test
    fun `a long-quiet drawer does not pull the slot into the past`() {
        assertEquals(
            now,
            nextNotificationSlot(now, lastShownAtMillis = now - 600_000L, gapSeconds = 5),
        )
    }
}
