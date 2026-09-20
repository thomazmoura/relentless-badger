import { OpenTask, taskRecurrence } from './models';
import { dateAt, plusDays, startOfDay, systemZone } from './time';

export interface DailyOverviewItem {
  readonly taskId: string;
  readonly title: string;
  /** When the task starts (or started) nagging. */
  readonly atMillis: number;
  /**
   * True when the nagging began before today. A bare time of day would read as
   * today's, so these need their date spelled out.
   */
  readonly fromEarlierDay: boolean;
  readonly recurring: boolean;
}

/**
 * The day split in two: what is already nagging and what is still to come
 * before the day is out.
 */
export interface DailyOverview {
  readonly now: readonly DailyOverviewItem[];
  readonly later: readonly DailyOverviewItem[];
}

export function isOverviewEmpty(overview: DailyOverview): boolean {
  return overview.now.length === 0 && overview.later.length === 0;
}

/**
 * Buckets the open tasks for a glanceable view of today.
 *
 * `now` holds everything whose nagging has begun, whatever day it began on — a
 * task still nagging from yesterday is exactly what "to be done now" means.
 * `later` holds only starts that fall on today's local date, so tomorrow stays
 * the calendar's business.
 *
 * The split keys off the first-warning time rather than nextFireAtMillis, the
 * same way the task list partitions its rows: nextFire drifts with snoozes, and
 * snoozing a nagging task must not pretend it is scheduled for later.
 *
 * A recurring series contributes at most its current occurrence: the cadence is
 * measured in days or weeks, so it can never fire twice in one day, and no
 * expansion is needed.
 */
export function buildDailyOverview(
  openTasks: readonly OpenTask[],
  nowMillis: number,
  zone: string = systemZone(),
): DailyOverview {
  const today = dateAt(nowMillis, zone);
  const dayStart = startOfDay(today, zone);
  const endOfDay = startOfDay(plusDays(today, 1), zone);
  const now: DailyOverviewItem[] = [];
  const later: DailyOverviewItem[] = [];

  for (const task of openTasks) {
    // The effective first-nag time, matching computeNextFire's start.
    const at =
      task.firstWarningAtMillis ?? task.createdAtMillis + task.initialDelayMinutes * 60_000;
    const item: DailyOverviewItem = {
      taskId: task.id,
      title: task.title,
      atMillis: at,
      fromEarlierDay: at < dayStart,
      recurring: taskRecurrence(task) !== null,
    };
    // Left as the task list has it: a null first warning counts as nagging, so
    // the two screens never disagree about where a row belongs.
    if ((task.firstWarningAtMillis ?? 0) <= nowMillis) {
      now.push(item);
    } else if (task.firstWarningAtMillis! < endOfDay) {
      later.push(item);
    }
  }

  // Tied timestamps get a stable title/id order so the list doesn't reshuffle
  // between ticks.
  const order = (a: DailyOverviewItem, b: DailyOverviewItem): number =>
    a.atMillis - b.atMillis || a.title.localeCompare(b.title) || a.taskId.localeCompare(b.taskId);
  return { now: now.sort(order), later: later.sort(order) };
}
