package com.relentlessbadger.app.data

/**
 * Default minimum gap between two notifications, in seconds. Simultaneous nags
 * stack in the drawer and hide each other, so a few seconds apart is enough to
 * make each one land as its own event.
 */
const val DEFAULT_NOTIFICATION_GAP_SECONDS = 5

/**
 * The earliest moment a notification may be shown: [nowMillis] once the gap
 * since [lastShownAtMillis] has elapsed, otherwise the end of that gap. A gap of
 * zero (or nothing shown yet) means no spacing at all.
 *
 * Reminders are delayed to this slot rather than dropped — unlike a throttle,
 * every nag still arrives, just not on top of the previous one.
 */
fun nextNotificationSlot(nowMillis: Long, lastShownAtMillis: Long?, gapSeconds: Int): Long {
    if (gapSeconds <= 0 || lastShownAtMillis == null) return nowMillis
    return maxOf(nowMillis, lastShownAtMillis + gapSeconds * 1000L)
}
