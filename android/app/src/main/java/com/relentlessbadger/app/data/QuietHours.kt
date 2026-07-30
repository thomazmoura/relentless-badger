package com.relentlessbadger.app.data

import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId

/** At most this many quiet windows; more would be a chore to edit, not a feature. */
const val MAX_QUIET_RANGES = 6

/** Offered when quiet hours are switched on for the first time: 22:00 to 07:00. */
val DEFAULT_QUIET_HOURS = listOf(QuietRange(22 * 60, 7 * 60))

private const val MINUTES_PER_DAY = 24 * 60

/**
 * A silent window in local wall-clock time, as minutes since midnight. An [end]
 * at or before [start] wraps past midnight, which is what the common overnight
 * window looks like: 22:00 to 07:00 is 1320 to 420.
 *
 * A window that starts and ends at the same minute would silence the whole day,
 * so it is rejected rather than quietly swallowing every reminder forever.
 */
data class QuietRange(val startMinute: Int, val endMinute: Int) {
    init {
        require(startMinute in 0 until MINUTES_PER_DAY) { "startMinute must be a minute of the day" }
        require(endMinute in 0 until MINUTES_PER_DAY) { "endMinute must be a minute of the day" }
        require(startMinute != endMinute) { "a quiet window must not start and end at the same minute" }
    }

    val wrapsMidnight: Boolean get() = endMinute < startMinute

    /** True while [minuteOfDay] is inside the window; the end minute is already out. */
    fun contains(minuteOfDay: Int): Boolean =
        if (wrapsMidnight) minuteOfDay >= startMinute || minuteOfDay < endMinute
        else minuteOfDay in startMinute until endMinute

    override fun toString(): String = "${format(startMinute)}-${format(endMinute)}"

    private fun format(minuteOfDay: Int): String =
        "%02d:%02d".format(minuteOfDay / 60, minuteOfDay % 60)
}

/**
 * [atMillis] pushed to the end of the quiet window it falls in; unchanged when
 * it falls outside every window, and unchanged when [ranges] is empty — quiet
 * hours switched off are just an empty list, so no caller checks a flag.
 *
 * Windows are wall-clock, so they are resolved in [zone] at the moment they are
 * applied: a 07:00 release stays 07:00 across a DST change, the same way a
 * recurring task keeps its time of day in [computeNextOccurrence].
 */
fun deferPastQuietHours(
    atMillis: Long,
    ranges: List<QuietRange>,
    zone: ZoneId = ZoneId.systemDefault(),
): Long {
    if (ranges.isEmpty()) return atMillis
    var at = atMillis
    // Windows can be adjacent or overlapping — leaving 22:00-07:00 can land
    // straight inside 07:00-08:00 — so keep stepping. One pass per window is
    // enough to clear them all, and the bound stops a pathological set spinning.
    repeat(ranges.size + 1) {
        val range = ranges.firstOrNull { it.contains(minuteOfDay(at, zone)) } ?: return at
        at = endOf(range, at, zone)
    }
    return at
}

private fun minuteOfDay(atMillis: Long, zone: ZoneId): Int =
    Instant.ofEpochMilli(atMillis).atZone(zone).toLocalTime().let { it.hour * 60 + it.minute }

/**
 * The first instant at or after [atMillis] where [range] is over. [atMillis] is
 * known to be inside the window, so the end is today's unless the window wraps
 * midnight and we are still on the evening side of it.
 */
private fun endOf(range: QuietRange, atMillis: Long, zone: ZoneId): Long {
    val local = Instant.ofEpochMilli(atMillis).atZone(zone)
    val endTime = LocalTime.of(range.endMinute / 60, range.endMinute % 60)
    val sameDay = local.toLocalDate().atTime(endTime).atZone(zone).toInstant().toEpochMilli()
    // Past midnight already, or a DST gap that moved the end back onto or before
    // the current instant: either way the release is on the next day.
    if (sameDay > atMillis) return sameDay
    return local.toLocalDate().plusDays(1).atTime(endTime).atZone(zone).toInstant().toEpochMilli()
}

/**
 * The stored windows, or an empty list when nothing usable is stored. Anything
 * malformed is dropped rather than failing the whole read: a corrupt entry
 * should cost the user that window, not silence the app or crash it.
 */
fun parseQuietHours(csv: String?): List<QuietRange> =
    csv?.split(',')
        ?.mapNotNull { parseQuietRange(it) }
        ?.take(MAX_QUIET_RANGES)
        .orEmpty()

/** One `HH:mm-HH:mm` window, or null when it is malformed or degenerate. */
fun parseQuietRange(text: String): QuietRange? {
    val (start, end) = text.trim().split('-').takeIf { it.size == 2 } ?: return null
    val startMinute = parseMinuteOfDay(start) ?: return null
    val endMinute = parseMinuteOfDay(end) ?: return null
    if (startMinute == endMinute) return null
    return QuietRange(startMinute, endMinute)
}

private fun parseMinuteOfDay(text: String): Int? {
    val (hours, minutes) = text.trim().split(':').takeIf { it.size == 2 } ?: return null
    val h = hours.toIntOrNull()?.takeIf { it in 0..23 } ?: return null
    val m = minutes.toIntOrNull()?.takeIf { it in 0..59 } ?: return null
    return h * 60 + m
}

fun List<QuietRange>.toCsv(): String = joinToString(",") { it.toString() }
