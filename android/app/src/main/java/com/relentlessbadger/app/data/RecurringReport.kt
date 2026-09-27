package com.relentlessbadger.app.data

import com.relentlessbadger.app.db.OpenTaskEntity

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
 * How a series is grouped in the report. Every day and every week are the
 * rhythms people plan around, so they lead; any other interval ("every 4
 * days", "every 2 weeks") is harder to keep in your head and goes last.
 */
enum class RecurringCadence { DAILY, WEEKLY, OTHER }

fun cadenceOf(recurrence: Recurrence): RecurringCadence = when {
    recurrence.everyN != 1 -> RecurringCadence.OTHER
    recurrence.unit == RecurUnit.DAYS -> RecurringCadence.DAILY
    else -> RecurringCadence.WEEKLY
}

data class RecurringReportSection(val cadence: RecurringCadence, val items: List<RecurringReportItem>)

/** The series as the ordered cadence sections that have any. */
data class RecurringReport(val sections: List<RecurringReportSection>) {
    val isEmpty: Boolean get() = sections.isEmpty()
}

/**
 * Every open recurring series, grouped by cadence and soonest first within
 * each: how often it repeats, the hour it fires at and when it fires next.
 *
 * Only the current occurrence is an open row, so "next" is that row's first
 * nag — the same instant the task list and the Today report place it at. Once
 * it has begun nagging it is reported as such rather than jumping ahead to the
 * following occurrence, which does not exist until this one is done.
 */
fun buildRecurringReport(
    openTasks: List<OpenTaskEntity>,
    nowMillis: Long,
): RecurringReport {
    val items = openTasks
        .mapNotNull { task ->
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
        // Tied timestamps get a stable title/id order so the list doesn't
        // reshuffle between ticks.
        .sortedWith(compareBy({ it.nextAtMillis }, { it.title }, { it.taskId }))
    val byCadence = items.groupBy { cadenceOf(it.recurrence) }
    return RecurringReport(
        RecurringCadence.entries.mapNotNull { cadence ->
            byCadence[cadence]?.let { RecurringReportSection(cadence, it) }
        },
    )
}
