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
 * How a series is grouped in the report. Every day and every week are the
 * rhythms people plan around, so they lead; any other interval ("every 4
 * days", "every 2 weeks") is harder to keep in your head and goes last.
 */
export type RecurringCadence = 'daily' | 'weekly' | 'other';

const CADENCE_ORDER: readonly RecurringCadence[] = ['daily', 'weekly', 'other'];

export function cadenceOf(recurrence: Recurrence): RecurringCadence {
  if (recurrence.everyN !== 1) return 'other';
  return recurrence.unit === 'days' ? 'daily' : 'weekly';
}

export interface RecurringReportSection {
  readonly cadence: RecurringCadence;
  readonly items: readonly RecurringReportItem[];
}

/** The series as the ordered cadence sections that have any. */
export interface RecurringReport {
  readonly sections: readonly RecurringReportSection[];
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
export function buildRecurringReport(
  openTasks: readonly OpenTask[],
  nowMillis: number,
): RecurringReport {
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
  items.sort(
    (a, b) =>
      a.nextAtMillis - b.nextAtMillis ||
      a.title.localeCompare(b.title) ||
      a.taskId.localeCompare(b.taskId),
  );
  const sections: RecurringReportSection[] = [];
  for (const cadence of CADENCE_ORDER) {
    const inCadence = items.filter((item) => cadenceOf(item.recurrence) === cadence);
    if (inCadence.length > 0) sections.push({ cadence, items: inCadence });
  }
  return { sections };
}
