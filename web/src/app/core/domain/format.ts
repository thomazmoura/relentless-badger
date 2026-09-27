import { ENGLISH, Strings } from '../i18n/strings';
import { Recurrence } from './models';
import { dateAt, dayOfWeek, LocalDate, partsAt, systemZone } from './time';

/**
 * User-facing strings, kept identical to the Android app's so the two clients
 * read the same. Rendering goes through Intl in the device zone, matching
 * java.time's ZoneId.systemDefault() formatters. Each takes the label table
 * for the language in force, English unless told otherwise.
 */

/** DateFormat.is24HourFormat's stand-in: the browser locale's clock convention. */
export function prefers24Hour(): boolean {
  return Intl.DateTimeFormat().resolvedOptions().hour12 === false;
}

/** "Jul 17, 3:05 PM", "Jul 17, 15:05" or "17 de jul, 15:05". */
export function formatDateTime(
  epochMillis: number,
  use24Hour: boolean,
  zone: string = systemZone(),
  strings: Strings = ENGLISH,
): string {
  const p = partsAt(epochMillis, zone);
  const date = strings.dayAndMonth(p.day, p.month);
  if (use24Hour) {
    return `${date}, ${pad2(p.hour)}:${pad2(p.minute)}`;
  }
  const suffix = p.hour < 12 ? 'AM' : 'PM';
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${date}, ${hour12}:${pad2(p.minute)} ${suffix}`;
}

/** "3:05 PM" or "15:05" — the same instant as formatDateTime, without the date. */
export function formatTimeOfDay(
  epochMillis: number,
  use24Hour: boolean,
  zone: string = systemZone(),
): string {
  const p = partsAt(epochMillis, zone);
  if (use24Hour) {
    return `${pad2(p.hour)}:${pad2(p.minute)}`;
  }
  const suffix = p.hour < 12 ? 'AM' : 'PM';
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${hour12}:${pad2(p.minute)} ${suffix}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** "now", "in 5 min", "in 3 h", "in 2 d". */
export function relativeFuture(
  epochMillis: number,
  nowMillis: number,
  strings: Strings = ENGLISH,
): string {
  const minutes = Math.trunc((epochMillis - nowMillis) / 60_000);
  if (minutes < 1) return strings.relativeNow;
  if (minutes < 60) return strings.inMinutes(minutes);
  if (minutes < 60 * 24) return strings.inHours(Math.trunc(minutes / 60));
  return strings.inDays(Math.trunc(minutes / (60 * 24)));
}

/** "45m", "4h", "1h 30m" — also used for the reminder's Wait button. */
export function formatDuration(minutes: number, strings: Strings = ENGLISH): string {
  return strings.duration(minutes);
}

/** Monday-first short weekday names, matching the recurrence bitmask's bit order. */
export function shortWeekdayNames(
  style: 'short' | 'narrow' = 'short',
  strings: Strings = ENGLISH,
): string[] {
  const formatter = new Intl.DateTimeFormat(strings.locale, { weekday: style, timeZone: 'UTC' });
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, i) => formatter.format(Date.UTC(2024, 0, 1 + i)));
}

/** "Friday, Sep 18" — how a day names itself once it isn't today. */
export function formatDayTitle(date: LocalDate, strings: Strings = ENGLISH): string {
  // UTC, because the date carries no zone of its own to render it in.
  const weekday = new Intl.DateTimeFormat(strings.locale, {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(Date.UTC(date.year, date.month - 1, date.day));
  return `${weekday}, ${strings.dayAndMonth(date.day, date.month)}`;
}

/** "September 2026" or "setembro de 2026". */
export function formatMonthTitle(year: number, month: number, strings: Strings = ENGLISH): string {
  return new Intl.DateTimeFormat(strings.locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(Date.UTC(year, month - 1, 1));
}

/** "every day", "every 3 days", "every week", "every 2 weeks · Mon, Wed, Fri". */
export function recurrenceLabel(recurrence: Recurrence, strings: Strings = ENGLISH): string {
  const cadence =
    recurrence.unit === 'days'
      ? recurrence.everyN === 1
        ? strings.everyDay
        : strings.everyNDays(recurrence.everyN)
      : recurrence.everyN === 1
        ? strings.everyWeek
        : strings.everyNWeeks(recurrence.everyN);
  if (recurrence.unit !== 'weeks') return cadence;
  const names = shortWeekdayNames('short', strings);
  const days = names.filter((_, index) => (recurrence.daysOfWeek & (1 << index)) !== 0).join(', ');
  return `${cadence} · ${days}`;
}

/** Bit for today's weekday, the natural starting selection. */
export function defaultWeekdayBit(nowMillis: number, zone: string = systemZone()): number {
  return 1 << dayOfWeek(dateAt(nowMillis, zone));
}
