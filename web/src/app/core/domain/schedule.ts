import { Recurrence } from './models';
import {
  atTimeOn,
  dateAt,
  daysBetween,
  plusDays,
  previousOrSameMonday,
  systemZone,
  timeAt,
  weeksBetween,
} from './time';

export const MINUTE_MILLIS = 60_000;

/**
 * First reminder fires at [firstWarningAtMillis] when set, otherwise
 * initialDelay after creation; afterwards it repeats every repeatInterval.
 * Returns the earliest slot in the future.
 */
export function computeNextFire(
  createdAtMillis: number,
  initialDelayMinutes: number,
  repeatIntervalMinutes: number,
  nowMillis: number,
  firstWarningAtMillis: number | null = null,
): number {
  const first = firstWarningAtMillis ?? createdAtMillis + initialDelayMinutes * MINUTE_MILLIS;
  if (first > nowMillis) return first;
  const interval = repeatIntervalMinutes * MINUTE_MILLIS;
  const periodsElapsed = Math.trunc((nowMillis - first) / interval) + 1;
  return first + periodsElapsed * interval;
}

/**
 * First on-schedule instant strictly after max([afterMillis], [anchorMillis]).
 *
 * The anchor is the current occurrence's first-warning time; its local
 * time-of-day (in [zone]) is the series' time-of-day and its date anchors the
 * cadence, so every spawned occurrence stays aligned to the schedule no matter
 * when the previous one was completed. Expanding in local wall time keeps the
 * clock time stable across DST transitions.
 */
export function computeNextOccurrence(
  anchorMillis: number,
  recurrence: Recurrence,
  afterMillis: number,
  zone: string = systemZone(),
): number {
  const anchorDate = dateAt(anchorMillis, zone);
  const timeOfDay = timeAt(anchorMillis, zone);
  const floor = Math.max(afterMillis, anchorMillis);
  const floorDate = dateAt(floor, zone);
  const instantOn = (date: { year: number; month: number; day: number }): number =>
    atTimeOn(date, timeOfDay, zone);

  if (recurrence.unit === 'days') {
    const stepDays = recurrence.everyN;
    // Land on the last on-schedule date not after the floor date, then step
    // forward until strictly past the floor instant.
    const elapsed = daysBetween(anchorDate, floorDate);
    let k = Math.max(0, Math.trunc(elapsed / stepDays));
    for (;;) {
      const candidate = instantOn(plusDays(anchorDate, k * stepDays));
      if (candidate > floor) return candidate;
      k++;
    }
  }

  const anchorWeekStart = previousOrSameMonday(anchorDate);
  const floorWeekStart = previousOrSameMonday(floorDate);
  const stepWeeks = recurrence.everyN;
  const elapsedWeeks = weeksBetween(anchorWeekStart, floorWeekStart);
  let m = Math.max(0, Math.trunc(elapsedWeeks / stepWeeks));
  for (;;) {
    const weekStart = plusDays(anchorWeekStart, m * stepWeeks * 7);
    for (let d = 0; d <= 6; d++) {
      if ((recurrence.daysOfWeek & (1 << d)) === 0) continue;
      const candidate = instantOn(plusDays(weekStart, d));
      if (candidate > floor) return candidate;
    }
    m++;
  }
}
