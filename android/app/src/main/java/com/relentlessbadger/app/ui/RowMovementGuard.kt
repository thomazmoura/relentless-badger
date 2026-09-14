package com.relentlessbadger.app.ui

import android.os.SystemClock

/** How long a task row takes to slide into its new slot. */
const val ROW_MOVE_ANIMATION_MILLIS = 300

/**
 * How long taps on task rows are swallowed after one moves. Longer than the
 * slide itself: a tap already on its way when the row moved lands a beat after
 * the list has settled, and it was aimed at whatever used to be there.
 */
const val ROW_MOVE_COOLDOWN_MILLIS = 600L

/** The "Scheduled" section header's slot in the row sequence. */
const val SCHEDULED_HEADER_KEY = "scheduled-header"

/** The list's rows top to bottom, as the keys the lazy list and the guard see. */
fun rowKeys(activeIds: List<String>, scheduledIds: List<String>): List<String> =
    if (scheduledIds.isEmpty()) activeIds else activeIds + SCHEDULED_HEADER_KEY + scheduledIds

/**
 * Makes a tap a no-op while the rows are still moving. Rows reorder on their own
 * — a nag fires, a sync lands, a start time passes — and without this a tap aimed
 * at one task lands on whichever task just slid into its place.
 *
 * Only a row that stays on screen but changes slot counts as a move: the first
 * list shown, a countdown tick that re-renders the same order, or a row dropping
 * off the end leave nothing under the finger that wasn't there before.
 */
class RowMovementGuard(private val clock: () -> Long = SystemClock::uptimeMillis) {
    private var shownKeys: List<String>? = null
    private var movedAtMillis: Long? = null

    /**
     * Records the rows now on screen. Returns whether the sequence changed at
     * all — a move or not — so the caller knows the list is about to re-anchor.
     */
    fun observe(keys: List<String>): Boolean {
        val previous = shownKeys
        if (previous == keys) return false
        shownKeys = keys
        if (previous != null && rowsShifted(previous, keys)) movedAtMillis = clock()
        return true
    }

    fun allowsTap(): Boolean {
        val movedAt = movedAtMillis ?: return true
        return clock() - movedAt >= ROW_MOVE_COOLDOWN_MILLIS
    }
}

/** Whether any row present both before and after sits in a different slot. */
internal fun rowsShifted(before: List<String>, after: List<String>): Boolean {
    val slotAfter = after.withIndex().associate { (index, key) -> key to index }
    return before.withIndex().any { (index, key) -> slotAfter[key].let { it != null && it != index } }
}
