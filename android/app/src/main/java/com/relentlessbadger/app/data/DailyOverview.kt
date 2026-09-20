package com.relentlessbadger.app.data

import com.relentlessbadger.app.db.OpenTaskEntity
import java.time.Instant
import java.time.ZoneId

data class DailyOverviewItem(
    val taskId: String,
    val title: String,
    /** When the task starts (or started) nagging. */
    val atMillis: Long,
    /**
     * True when the nagging began before today. A bare time of day would read
     * as today's, so these need their date spelled out.
     */
    val fromEarlierDay: Boolean,
    val recurring: Boolean,
)

/**
 * The day split in two: what is already nagging and what is still to come
 * before the day is out.
 */
data class DailyOverview(
    val now: List<DailyOverviewItem>,
    val later: List<DailyOverviewItem>,
) {
    val isEmpty: Boolean get() = now.isEmpty() && later.isEmpty()
}

/**
 * Buckets the open tasks for a glanceable view of today.
 *
 * [DailyOverview.now] holds everything whose nagging has begun, whatever day it
 * began on — a task still nagging from yesterday is exactly what "to be done
 * now" means. [DailyOverview.later] holds only starts that fall on today's
 * local date, so tomorrow stays the calendar's business.
 *
 * The split keys off the first-warning time rather than nextFireAtMillis, the
 * same way the task list partitions its rows: nextFire drifts with snoozes, and
 * snoozing a nagging task must not pretend it is scheduled for later.
 *
 * A recurring series contributes at most its current occurrence: the cadence is
 * measured in days or weeks, so it can never fire twice in one day, and no
 * expansion is needed.
 */
fun buildDailyOverview(
    openTasks: List<OpenTaskEntity>,
    nowMillis: Long,
    zone: ZoneId = ZoneId.systemDefault(),
): DailyOverview {
    val today = Instant.ofEpochMilli(nowMillis).atZone(zone).toLocalDate()
    val startOfDay = today.atStartOfDay(zone).toInstant().toEpochMilli()
    val endOfDay = today.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
    val now = mutableListOf<DailyOverviewItem>()
    val later = mutableListOf<DailyOverviewItem>()

    for (task in openTasks) {
        // The effective first-nag time, matching computeNextFire's start.
        val at = task.firstWarningAtMillis
            ?: (task.createdAtMillis + task.initialDelayMinutes * 60_000L)
        val item = DailyOverviewItem(
            taskId = task.id,
            title = task.title,
            atMillis = at,
            fromEarlierDay = at < startOfDay,
            recurring = task.recurrence() != null,
        )
        // Left as the task list has it: a null first warning counts as nagging,
        // so the two screens never disagree about where a row belongs.
        if ((task.firstWarningAtMillis ?: 0L) <= nowMillis) {
            now += item
        } else if (task.firstWarningAtMillis!! < endOfDay) {
            later += item
        }
    }

    // Tied timestamps get a stable title/id order so the list doesn't reshuffle
    // between ticks.
    val order = compareBy<DailyOverviewItem>({ it.atMillis }, { it.title }, { it.taskId })
    return DailyOverview(now = now.sortedWith(order), later = later.sortedWith(order))
}
