package com.relentlessbadger.app.data

import com.relentlessbadger.app.db.CompletedTaskEntity
import com.relentlessbadger.app.db.OpenTaskEntity
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId

enum class CalendarEntryKind { COMPLETED, CANCELLED, SCHEDULED }

data class CalendarEntry(
    val taskId: String,
    val title: String,
    val atMillis: Long,
    val kind: CalendarEntryKind,
    val recurring: Boolean,
)

/**
 * Buckets a month's calendar content by local date: completions on the day
 * they happened, open tasks on the day they are scheduled to start. Recurring
 * tasks are expanded to every occurrence inside the month, so future days show
 * what will fire on them. Each day's entries are sorted ascending by time.
 *
 * Cancelled tasks are left out unless [includeCancelled]: a day that only holds
 * cancellations then has no entries at all, so it also loses its calendar dot.
 */
fun buildMonthEntries(
    openTasks: List<OpenTaskEntity>,
    completed: List<CompletedTaskEntity>,
    month: YearMonth,
    zone: ZoneId = ZoneId.systemDefault(),
    includeCancelled: Boolean = false,
): Map<LocalDate, List<CalendarEntry>> {
    val monthStart = month.atDay(1).atStartOfDay(zone).toInstant().toEpochMilli()
    val monthEnd = month.plusMonths(1).atDay(1).atStartOfDay(zone).toInstant().toEpochMilli()
    val entries = mutableListOf<CalendarEntry>()

    for (task in completed) {
        if (task.cancelled && !includeCancelled) continue
        if (task.completedAtMillis in monthStart until monthEnd) {
            entries += CalendarEntry(
                taskId = task.id,
                title = task.title,
                atMillis = task.completedAtMillis,
                kind = if (task.cancelled) {
                    CalendarEntryKind.CANCELLED
                } else {
                    CalendarEntryKind.COMPLETED
                },
                recurring = task.seriesId != null,
            )
        }
    }

    for (task in openTasks) {
        val recurrence = task.recurrence()
        if (recurrence == null) {
            // The effective first-nag time — not nextFireAtMillis, which
            // drifts with snoozes and re-nags.
            val at = task.firstWarningAtMillis
                ?: (task.createdAtMillis + task.initialDelayMinutes * 60_000L)
            if (at in monthStart until monthEnd) {
                entries += CalendarEntry(task.id, task.title, at, CalendarEntryKind.SCHEDULED, false)
            }
        } else {
            // The anchor is itself the first occurrence and earlier ones
            // belong to previously spawned (completed) rows, so expansion
            // starts at the anchor; computeNextOccurrence is strictly-after.
            val anchor = task.firstWarningAtMillis ?: task.createdAtMillis
            var at = anchor
            while (at < monthEnd) {
                if (at >= monthStart) {
                    entries += CalendarEntry(task.id, task.title, at, CalendarEntryKind.SCHEDULED, true)
                }
                at = computeNextOccurrence(anchor, recurrence, afterMillis = at, zone = zone)
            }
        }
    }

    // Tied timestamps (e.g. a batch completed in one sweep) get a stable
    // title/id order so the list doesn't reshuffle between refreshes.
    return entries
        .sortedWith(compareBy({ it.atMillis }, { it.title }, { it.taskId }))
        .groupBy { Instant.ofEpochMilli(it.atMillis).atZone(zone).toLocalDate() }
}
