package com.relentlessbadger.app.data

/**
 * Hours, minutes and seconds in that order, each optional but at least one
 * present: "1h 20m", "15m45s", "90s". Spaces are allowed anywhere between the
 * parts. Five digits per part is far beyond any sensible snooze and keeps the
 * total well clear of overflow.
 */
private val WAIT_DURATION = Regex(
    """^(?:(\d{1,5})\s*h)?\s*(?:(\d{1,5})\s*m(?:in)?)?\s*(?:(\d{1,5})\s*s)?$""",
    RegexOption.IGNORE_CASE,
)

private val BARE_MINUTES = Regex("""^\d{1,5}$""")

/**
 * Reads a typed wait such as "27m" or "15m 45s" into milliseconds, or null when
 * it isn't one. A bare number means minutes, the unit every configured wait
 * already speaks. A zero total is rejected too: snoozing for nothing would fire
 * at once and look like the snooze did nothing.
 */
fun parseWaitDuration(text: String): Long? {
    val trimmed = text.trim()
    if (BARE_MINUTES.matches(trimmed)) {
        return (trimmed.toLong() * 60_000L).takeIf { it > 0 }
    }
    val match = WAIT_DURATION.matchEntire(trimmed) ?: return null
    val (hours, minutes, seconds) = match.destructured
    if (hours.isEmpty() && minutes.isEmpty() && seconds.isEmpty()) return null
    val millis = (hours.toLongOrNull() ?: 0L) * 3_600_000L +
        (minutes.toLongOrNull() ?: 0L) * 60_000L +
        (seconds.toLongOrNull() ?: 0L) * 1_000L
    return millis.takeIf { it > 0 }
}
