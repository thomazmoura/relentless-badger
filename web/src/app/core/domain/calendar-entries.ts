import { CompletedTask, OpenTask, taskRecurrence } from './models';
import { computeNextOccurrence, MINUTE_MILLIS } from './schedule';
import {
  atDay,
  dateAt,
  dateKey,
  LocalDate,
  plusMonths,
  startOfDay,
  systemZone,
  YearMonth,
} from './time';

export type CalendarEntryKind = 'completed' | 'cancelled' | 'scheduled';

export interface CalendarEntry {
  readonly taskId: string;
  readonly title: string;
  readonly atMillis: number;
  readonly kind: CalendarEntryKind;
  readonly recurring: boolean;
}

export interface CalendarDay {
  readonly date: LocalDate;
  readonly entries: readonly CalendarEntry[];
}

/**
 * Buckets a month's calendar content by local date: completions on the day
 * they happened, open tasks on the day they are scheduled to start. Recurring
 * tasks are expanded to every occurrence inside the month, so future days show
 * what will fire on them. Each day's entries are sorted ascending by time.
 *
 * Cancelled tasks are left out unless [includeCancelled]: a day that only holds
 * cancellations then has no entries at all, so it also loses its calendar dot.
 *
 * Keyed by dateKey() ("2026-07-17") because objects can't be map keys by value.
 */
export function buildMonthEntries(
  openTasks: readonly OpenTask[],
  completed: readonly CompletedTask[],
  month: YearMonth,
  zone: string = systemZone(),
  includeCancelled = false,
): Map<string, CalendarEntry[]> {
  const monthStart = startOfDay(atDay(month, 1), zone);
  const monthEnd = startOfDay(atDay(plusMonths(month, 1), 1), zone);
  const entries: CalendarEntry[] = [];

  for (const task of completed) {
    if (task.cancelled && !includeCancelled) continue;
    if (task.completedAtMillis >= monthStart && task.completedAtMillis < monthEnd) {
      entries.push({
        taskId: task.id,
        title: task.title,
        atMillis: task.completedAtMillis,
        kind: task.cancelled ? 'cancelled' : 'completed',
        recurring: task.seriesId !== null,
      });
    }
  }

  for (const task of openTasks) {
    const recurrence = taskRecurrence(task);
    if (recurrence === null) {
      // The effective first-nag time — not nextFireAtMillis, which drifts with
      // snoozes and re-nags.
      const at =
        task.firstWarningAtMillis ??
        task.createdAtMillis + task.initialDelayMinutes * MINUTE_MILLIS;
      if (at >= monthStart && at < monthEnd) {
        entries.push({
          taskId: task.id,
          title: task.title,
          atMillis: at,
          kind: 'scheduled',
          recurring: false,
        });
      }
    } else {
      // The anchor is itself the first occurrence and earlier ones belong to
      // previously spawned (completed) rows, so expansion starts at the anchor;
      // computeNextOccurrence is strictly-after.
      const anchor = task.firstWarningAtMillis ?? task.createdAtMillis;
      let at = anchor;
      while (at < monthEnd) {
        if (at >= monthStart) {
          entries.push({
            taskId: task.id,
            title: task.title,
            atMillis: at,
            kind: 'scheduled',
            recurring: true,
          });
        }
        at = computeNextOccurrence(anchor, recurrence, at, zone);
      }
    }
  }

  // Tied timestamps (e.g. a batch completed in one sweep) get a stable
  // title/id order so the list doesn't reshuffle between refreshes.
  entries.sort(
    (a, b) =>
      a.atMillis - b.atMillis ||
      compareStrings(a.title, b.title) ||
      compareStrings(a.taskId, b.taskId),
  );

  const byDay = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    const key = dateKey(dateAt(entry.atMillis, zone));
    const bucket = byDay.get(key);
    if (bucket) {
      bucket.push(entry);
    } else {
      byDay.set(key, [entry]);
    }
  }
  return byDay;
}

// Kotlin's compareBy on String is ordinal (UTF-16 code unit) order, not locale-aware.
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
