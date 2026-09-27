// Ported from RecurringReport.kt.
import { firstNagAtMillis } from './daily-overview';
import { OpenTask, Recurrence, taskRecurrence } from './models';

export interface RecurringReportItem {
  readonly taskId: string;
  readonly title: string;
  readonly recurrence: Recurrence;
  /**
   * The series' anchor: its local time of day is the hour every occurrence
   * fires at, as computeNextOccurrence reads it.
   */
  readonly anchorMillis: number;
  /** When the current occurrence starts nagging, or started if `nagging`. */
  readonly nextAtMillis: number;
  /** True when the current occurrence is already nagging, so "next" is now. */
  readonly nagging: boolean;
}

/**
 * Every open recurring series, soonest first: how often it repeats, the hour it
 * fires at and when it fires next.
 *
 * Only the current occurrence is an open row, so "next" is that row's first
 * nag — the same instant the task list and the Today report place it at. Once
 * it has begun nagging it is reported as such rather than jumping ahead to the
 * following occurrence, which does not exist until this one is done.
 */
export function buildRecurringReport(
  openTasks: readonly OpenTask[],
  nowMillis: number,
): RecurringReportItem[] {
  const items: RecurringReportItem[] = [];
  for (const task of openTasks) {
    const recurrence = taskRecurrence(task);
    if (recurrence === null) continue;
    items.push({
      taskId: task.id,
      title: task.title,
      recurrence,
      anchorMillis: task.firstWarningAtMillis ?? task.createdAtMillis,
      nextAtMillis: firstNagAtMillis(task),
      // As the task list has it: a null first warning counts as nagging.
      nagging: (task.firstWarningAtMillis ?? 0) <= nowMillis,
    });
  }
  // Tied timestamps get a stable title/id order so the list doesn't reshuffle
  // between ticks.
  return items.sort(
    (a, b) =>
      a.nextAtMillis - b.nextAtMillis ||
      a.title.localeCompare(b.title) ||
      a.taskId.localeCompare(b.taskId),
  );
}
