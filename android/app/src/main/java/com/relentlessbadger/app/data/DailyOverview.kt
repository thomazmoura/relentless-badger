package com.relentlessbadger.app.data

import com.relentlessbadger.app.db.CompletedTaskEntity
import com.relentlessbadger.app.db.OpenTaskEntity
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

data class DailyOverviewItem(
    val taskId: String,
    val title: String,
    /** When the task starts (or started) nagging, or when it was completed. */
    val atMillis: Long,
    /**
     * True when the nagging began before the day being shown. A bare time of day
     * would read as that day's, so these need their date spelled out.
     */
    val fromEarlierDay: Boolean,
    val recurring: Boolean,
)

/**
 * Which question a section answers. The set on screen depends on the date:
 * today splits into [NOW] and [LATER], a past day into what was left [OVERDUE],
 * a future day into what will fire [SCHEDULED]. [DONE] is opt-in and can join
 * any of them.
 */
enum class OverviewSectionKind { NOW, LATER, SCHEDULED, OVERDUE, DONE }

data class OverviewSection(val kind: OverviewSectionKind, val items: List<DailyOverviewItem>)

/** A single day, as the ordered sections worth showing for it. */
data class DailyOverview(
    val date: LocalDate,
    val sections: List<OverviewSection>,
) {
    val isEmpty: Boolean get() = sections.isEmpty()
}

/**
 * The effective first-nag time: when this task starts (or started) nagging.
 *
 * Deliberately not nextFireAtMillis, which drifts with snoozes and re-nags —
 * every screen that places a task on a day wants the moment it became due, so
 * snoozing a task never moves it to another day or another section.
 */
fun OpenTaskEntity.firstNagAtMillis(): Long =
    firstWarningAtMillis ?: (createdAtMillis + initialDelayMinutes * 60_000L)

/**
 * Buckets a day's tasks for a glanceable, read-only digest of it.
 *
 * Today reads as the task list does: [OverviewSectionKind.NOW] holds everything
 * whose nagging has begun, whatever day it began on — a task still nagging from
 * yesterday is exactly what "to be done now" means — and
 * [OverviewSectionKind.LATER] holds only starts that fall before midnight, so
 * tomorrow stays the calendar's business.
 *
 * Another date cannot ask "now". A past day shows [OverviewSectionKind.OVERDUE]:
 * what came due that day and is still open, the debt the day left behind. A
 * future day shows [OverviewSectionKind.SCHEDULED], with recurring series
 * expanded to the occurrence that actually lands on it — unlike today and the
 * past, where earlier occurrences are already completed rows and the series
 * carries only its current one.
 *
 * [includeConcluded] appends [OverviewSectionKind.DONE] from the day's
 * completions. Cancellations are left out whatever the flag says: the calendar
 * owns those, and a cancellation must never read as an accomplishment.
 */
fun buildDailyOverview(
    openTasks: List<OpenTaskEntity>,
    completed: List<CompletedTaskEntity>,
    date: LocalDate,
    nowMillis: Long,
    includeConcluded: Boolean,
    zone: ZoneId = ZoneId.systemDefault(),
): DailyOverview {
    val startOfDay = date.atStartOfDay(zone).toInstant().toEpochMilli()
    val endOfDay = date.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
    val today = Instant.ofEpochMilli(nowMillis).atZone(zone).toLocalDate()

    fun item(task: OpenTaskEntity, at: Long) = DailyOverviewItem(
        taskId = task.id,
        title = task.title,
        atMillis = at,
        fromEarlierDay = at < startOfDay,
        recurring = task.recurrence() != null,
    )

    val now = mutableListOf<DailyOverviewItem>()
    val later = mutableListOf<DailyOverviewItem>()
    val scheduled = mutableListOf<DailyOverviewItem>()
    val overdue = mutableListOf<DailyOverviewItem>()

    for (task in openTasks) {
        val at = task.firstNagAtMillis()
        when {
            date == today ->
                // Left as the task list has it: a null first warning counts as
                // nagging, so the two screens never disagree about where a row
                // belongs.
                if ((task.firstWarningAtMillis ?: 0L) <= nowMillis) {
                    now += item(task, at)
                } else if (task.firstWarningAtMillis!! < endOfDay) {
                    later += item(task, at)
                }

            date < today -> if (at in startOfDay until endOfDay) overdue += item(task, at)

            else -> {
                val recurrence = task.recurrence()
                if (recurrence == null) {
                    if (at in startOfDay until endOfDay) scheduled += item(task, at)
                } else {
                    // The anchor is itself the first occurrence, so expansion
                    // starts there; computeNextOccurrence is strictly-after.
                    val anchor = task.firstWarningAtMillis ?: task.createdAtMillis
                    var occurrence = anchor
                    while (occurrence < endOfDay) {
                        if (occurrence >= startOfDay) scheduled += item(task, occurrence)
                        occurrence = computeNextOccurrence(anchor, recurrence, afterMillis = occurrence, zone = zone)
                    }
                }
            }
        }
    }

    val done = if (!includeConcluded) {
        emptyList()
    } else {
        completed
            .filterNot { it.cancelled }
            .filter { it.completedAtMillis in startOfDay until endOfDay }
            .map {
                DailyOverviewItem(
                    taskId = it.id,
                    title = it.title,
                    atMillis = it.completedAtMillis,
                    fromEarlierDay = false,
                    recurring = it.seriesId != null,
                )
            }
    }

    // Tied timestamps get a stable title/id order so the list doesn't reshuffle
    // between ticks.
    val order = compareBy<DailyOverviewItem>({ it.atMillis }, { it.title }, { it.taskId })
    val sections = listOf(
        OverviewSectionKind.NOW to now,
        OverviewSectionKind.LATER to later,
        OverviewSectionKind.SCHEDULED to scheduled,
        OverviewSectionKind.OVERDUE to overdue,
        OverviewSectionKind.DONE to done,
    )
    return DailyOverview(
        date = date,
        sections = sections
            .filter { (_, items) -> items.isNotEmpty() }
            .map { (kind, items) -> OverviewSection(kind, items.sortedWith(order)) },
    )
}
