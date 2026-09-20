// Ported from DailyOverview.kt.
import { CompletedTask, OpenTask, taskRecurrence } from './models';
import { computeNextOccurrence, MINUTE_MILLIS } from './schedule';
import { compareDates, dateAt, LocalDate, plusDays, startOfDay, systemZone } from './time';

export interface DailyOverviewItem {
  readonly taskId: string;
  readonly title: string;
  /** When the task starts (or started) nagging, or when it was completed. */
  readonly atMillis: number;
  /**
   * True when the nagging began before the day being shown. A bare time of day
   * would read as that day's, so these need their date spelled out.
   */
  readonly fromEarlierDay: boolean;
  readonly recurring: boolean;
}

/**
 * Which question a section answers. The set on screen depends on the date:
 * today splits into `now` and `later`, a past day into what was left
 * (`overdue`), a future day into what will fire (`scheduled`). `done` is opt-in
 * and can join any of them.
 */
export type OverviewSectionKind = 'now' | 'later' | 'scheduled' | 'overdue' | 'done';

export interface OverviewSection {
  readonly kind: OverviewSectionKind;
  readonly items: readonly DailyOverviewItem[];
}

/** A single day, as the ordered sections worth showing for it. */
export interface DailyOverview {
  readonly date: LocalDate;
  readonly sections: readonly OverviewSection[];
}

export function isOverviewEmpty(overview: DailyOverview): boolean {
  return overview.sections.length === 0;
}

/** The items of `kind`, or an empty list when that section isn't on screen. */
export function overviewItems(
  overview: DailyOverview,
  kind: OverviewSectionKind,
): readonly DailyOverviewItem[] {
  return overview.sections.find((section) => section.kind === kind)?.items ?? [];
}

/**
 * The effective first-nag time: when this task starts (or started) nagging.
 *
 * Deliberately not nextFireAtMillis, which drifts with snoozes and re-nags —
 * every screen that places a task on a day wants the moment it became due, so
 * snoozing a task never moves it to another day or another section.
 */
export function firstNagAtMillis(task: OpenTask): number {
  return (
    task.firstWarningAtMillis ?? task.createdAtMillis + task.initialDelayMinutes * MINUTE_MILLIS
  );
}

/**
 * Buckets a day's tasks for a glanceable, read-only digest of it.
 *
 * Today reads as the task list does: `now` holds everything whose nagging has
 * begun, whatever day it began on — a task still nagging from yesterday is
 * exactly what "to be done now" means — and `later` holds only starts that fall
 * before midnight, so tomorrow stays the calendar's business.
 *
 * Another date cannot ask "now". A past day shows `overdue`: what came due that
 * day and is still open, the debt the day left behind. A future day shows
 * `scheduled`, with recurring series expanded to the occurrence that actually
 * lands on it — unlike today and the past, where earlier occurrences are
 * already completed rows and the series carries only its current one.
 *
 * `includeConcluded` appends `done` from the day's completions. Cancellations
 * are left out whatever the flag says: the calendar owns those, and a
 * cancellation must never read as an accomplishment.
 */
export function buildDailyOverview(
  openTasks: readonly OpenTask[],
  completed: readonly CompletedTask[],
  date: LocalDate,
  nowMillis: number,
  includeConcluded: boolean,
  zone: string = systemZone(),
): DailyOverview {
  const dayStart = startOfDay(date, zone);
  const dayEnd = startOfDay(plusDays(date, 1), zone);
  const today = dateAt(nowMillis, zone);
  const relativeToToday = compareDates(date, today);

  const item = (task: OpenTask, at: number): DailyOverviewItem => ({
    taskId: task.id,
    title: task.title,
    atMillis: at,
    fromEarlierDay: at < dayStart,
    recurring: taskRecurrence(task) !== null,
  });

  const now: DailyOverviewItem[] = [];
  const later: DailyOverviewItem[] = [];
  const scheduled: DailyOverviewItem[] = [];
  const overdue: DailyOverviewItem[] = [];

  for (const task of openTasks) {
    const at = firstNagAtMillis(task);
    if (relativeToToday === 0) {
      // Left as the task list has it: a null first warning counts as nagging,
      // so the two screens never disagree about where a row belongs.
      if ((task.firstWarningAtMillis ?? 0) <= nowMillis) {
        now.push(item(task, at));
      } else if (task.firstWarningAtMillis! < dayEnd) {
        later.push(item(task, at));
      }
    } else if (relativeToToday < 0) {
      if (at >= dayStart && at < dayEnd) overdue.push(item(task, at));
    } else {
      const recurrence = taskRecurrence(task);
      if (recurrence === null) {
        if (at >= dayStart && at < dayEnd) scheduled.push(item(task, at));
      } else {
        // The anchor is itself the first occurrence, so expansion starts there;
        // computeNextOccurrence is strictly-after.
        const anchor = task.firstWarningAtMillis ?? task.createdAtMillis;
        let occurrence = anchor;
        while (occurrence < dayEnd) {
          if (occurrence >= dayStart) scheduled.push(item(task, occurrence));
          occurrence = computeNextOccurrence(anchor, recurrence, occurrence, zone);
        }
      }
    }
  }

  const done: DailyOverviewItem[] = !includeConcluded
    ? []
    : completed
        .filter(
          (task) =>
            !task.cancelled &&
            task.completedAtMillis >= dayStart &&
            task.completedAtMillis < dayEnd,
        )
        .map((task) => ({
          taskId: task.id,
          title: task.title,
          atMillis: task.completedAtMillis,
          fromEarlierDay: false,
          recurring: task.seriesId !== null,
        }));

  // Tied timestamps get a stable title/id order so the list doesn't reshuffle
  // between ticks.
  const order = (a: DailyOverviewItem, b: DailyOverviewItem): number =>
    a.atMillis - b.atMillis || a.title.localeCompare(b.title) || a.taskId.localeCompare(b.taskId);

  const candidates: readonly (readonly [OverviewSectionKind, DailyOverviewItem[]])[] = [
    ['now', now],
    ['later', later],
    ['scheduled', scheduled],
    ['overdue', overdue],
    ['done', done],
  ];
  return {
    date,
    sections: candidates
      .filter(([, items]) => items.length > 0)
      .map(([kind, items]) => ({ kind, items: items.sort(order) })),
  };
}
