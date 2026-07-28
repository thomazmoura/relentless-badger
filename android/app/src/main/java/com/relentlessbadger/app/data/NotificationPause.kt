package com.relentlessbadger.app.data

/** Ready-made pause lengths offered by the notification menu, in minutes. */
val PAUSE_OPTIONS_MINUTES = listOf(30, 60, 120, 480)

/**
 * [atMillis] pushed to the end of the pause when it would have fired while
 * notifications are paused; unchanged otherwise. A pause whose end has already
 * passed is indistinguishable from no pause at all, so no caller needs to
 * compare it against the clock itself.
 */
fun deferPastPause(atMillis: Long, pauseUntilMillis: Long?): Long =
    if (pauseUntilMillis != null && atMillis < pauseUntilMillis) pauseUntilMillis else atMillis
