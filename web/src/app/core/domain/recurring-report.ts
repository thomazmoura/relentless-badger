// Ported from RecurringReport.kt.
import { firstNagAtMillis } from './daily-overview';
import { OpenTask, RecurUnit, Recurrence, taskRecurrence } from './models';
import { systemZone, timeAt } from './time';

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
 * How often a series repeats, which is what the report groups it by. The
 * weekdays a weekly series fires on are left out: "every 2 weeks" is one
 * section whatever days each series picks, and its rows say which.
 */
export interface RecurringCadence {
  readonly everyN: number;
  readonly unit: RecurUnit;
}

export function cadenceOf(recurrence: Recurrence): RecurringCadence {
  return { everyN: recurrence.everyN, unit: recurrence.unit };
}

/** A stable key for a cadence, for grouping and template tracking. */
export function cadenceKey(cadence: RecurringCadence): string {
  return `${cadence.everyN}:${cadence.unit}`;
}

/** How many days one cycle spans, for ordering the intervals. */
function periodDays(cadence: RecurringCadence): number {
  return cadence.unit === 'weeks' ? cadence.everyN * 7 : cadence.everyN;
}

function cadenceRank(cadence: RecurringCadence): number {
  if (cadence.everyN !== 1) return 2;
  return cadence.unit === 'days' ? 0 : 1;
}

/**
 * Every day and every week are the rhythms people plan around, so they lead;
 * the other intervals follow, shortest first, "every 14 days" ahead of the
 * "every 2 weeks" it matches.
 */
function compareCadences(a: RecurringCadence, b: RecurringCadence): number {
  return (
    cadenceRank(a) - cadenceRank(b) ||
    periodDays(a) - periodDays(b) ||
    (a.unit === b.unit ? 0 : a.unit === 'days' ? -1 : 1)
  );
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
 * Every open recurring series, one section per interval, each running through
 * the day by the hour its series fires at: how often it repeats, that hour and
 * when it fires next.
 *
 * Only the current occurrence is an open row, so "next" is that row's first
 * nag — the same instant the task list and the Today report place it at. Once
 * it has begun nagging it is reported as such rather than jumping ahead to the
 * following occurrence, which does not exist until this one is done.
 */
export function buildRecurringReport(
  openTasks: readonly OpenTask[],
  nowMillis: number,
  zone: string = systemZone(),
): RecurringReport {
  const byCadence = new Map<string, { cadence: RecurringCadence; items: RecurringReportItem[] }>();
  for (const task of openTasks) {
    const recurrence = taskRecurrence(task);
    if (recurrence === null) continue;
    const cadence = cadenceOf(recurrence);
    const key = cadenceKey(cadence);
    let group = byCadence.get(key);
    if (group === undefined) {
      group = { cadence, items: [] };
      byCadence.set(key, group);
    }
    group.items.push({
      taskId: task.id,
      title: task.title,
      recurrence,
      anchorMillis: task.firstWarningAtMillis ?? task.createdAtMillis,
      nextAtMillis: firstNagAtMillis(task),
      // As the task list has it: a null first warning counts as nagging.
      nagging: (task.firstWarningAtMillis ?? 0) <= nowMillis,
    });
  }
  // The time of day, not the next date: within an interval the section reads
  // as a routine. Ties get a stable title/id order so rows don't reshuffle.
  const timeOfDay = (item: RecurringReportItem): number => {
    const t = timeAt(item.anchorMillis, zone);
    return ((t.hour * 60 + t.minute) * 60 + t.second) * 1000 + t.millis;
  };
  return {
    sections: [...byCadence.values()]
      .sort((a, b) => compareCadences(a.cadence, b.cadence))
      .map(({ cadence, items }) => ({
        cadence,
        items: items.sort(
          (a, b) =>
            timeOfDay(a) - timeOfDay(b) ||
            a.title.localeCompare(b.title) ||
            a.taskId.localeCompare(b.taskId),
        ),
      })),
  };
}
