package com.relentlessbadger.app.data

import com.relentlessbadger.app.db.OpenTaskEntity
import java.time.Instant
import java.time.ZoneId

data class RecurringReportItem(
    val taskId: String,
    val title: String,
    val recurrence: Recurrence,
    /**
     * The series' anchor: its local time of day is the hour every occurrence
     * fires at, as [computeNextOccurrence] reads it.
     */
    val anchorMillis: Long,
    /** When the current occurrence starts nagging, or started if [nagging]. */
    val nextAtMillis: Long,
    /** True when the current occurrence is already nagging, so "next" is now. */
    val nagging: Boolean,
)

/**
 * How often a series repeats, which is what the report groups it by. The
 * weekdays a weekly series fires on are left out: "every 2 weeks" is one
 * section whatever days each series picks, and its rows say which.
 */
data class RecurringCadence(val everyN: Int, val unit: RecurUnit) {
    /** How many days one cycle spans, for ordering the intervals. */
    val periodDays: Int get() = if (unit == RecurUnit.WEEKS) everyN * 7 else everyN
}

fun cadenceOf(recurrence: Recurrence): RecurringCadence =
    RecurringCadence(recurrence.everyN, recurrence.unit)

/**
 * Every day and every week are the rhythms people plan around, so they lead;
 * the other intervals follow, shortest first, "every 14 days" ahead of the
 * "every 2 weeks" it matches.
 */
private val cadenceOrder: Comparator<RecurringCadence> =
    compareBy<RecurringCadence> {
        when (it) {
            RecurringCadence(1, RecurUnit.DAYS) -> 0
            RecurringCadence(1, RecurUnit.WEEKS) -> 1
            else -> 2
        }
    }
        .thenBy { it.periodDays }
        .thenBy { it.unit }

data class RecurringReportSection(val cadence: RecurringCadence, val items: List<RecurringReportItem>)

/** The series as the ordered cadence sections that have any. */
data class RecurringReport(val sections: List<RecurringReportSection>) {
    val isEmpty: Boolean get() = sections.isEmpty()
}

/**
 * Every open recurring series, one section per interval, each running through
 * the day by the hour its series fires at: how often it repeats, that hour and
 * when it fires next.
 *
 * Only the current occurrence is an open row, so "next" is that row's first
 * nag — the same instant the task list and the Today report place it at. Once
 * it has begun nagging it is reported as such rather than jumping ahead to the
 * following occurrence, which does not exist until this one is done.
 */
fun buildRecurringReport(
    openTasks: List<OpenTaskEntity>,
    nowMillis: Long,
    zone: ZoneId = ZoneId.systemDefault(),
): RecurringReport {
    val items = openTasks.mapNotNull { task ->
        val recurrence = task.recurrence() ?: return@mapNotNull null
        RecurringReportItem(
            taskId = task.id,
            title = task.title,
            recurrence = recurrence,
            anchorMillis = task.firstWarningAtMillis ?: task.createdAtMillis,
            nextAtMillis = task.firstNagAtMillis(),
            // As the task list has it: a null first warning counts as nagging.
            nagging = (task.firstWarningAtMillis ?: 0L) <= nowMillis,
        )
    }
    // The time of day, not the next date: within an interval the section reads
    // as a routine. Ties get a stable title/id order so rows don't reshuffle.
    val order = compareBy<RecurringReportItem>(
        { Instant.ofEpochMilli(it.anchorMillis).atZone(zone).toLocalTime() },
        { it.title },
        { it.taskId },
    )
    return RecurringReport(
        items.groupBy { cadenceOf(it.recurrence) }
            .toSortedMap(cadenceOrder)
            .map { (cadence, inCadence) -> RecurringReportSection(cadence, inCadence.sortedWith(order)) },
    )
}
