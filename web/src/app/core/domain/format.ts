import { Recurrence } from './models';
import { dateAt, dayOfWeek, partsAt, systemZone } from './time';

/**
 * User-facing strings, kept identical to the Android app's so the two clients
 * read the same. Rendering goes through Intl in the device zone, matching
 * java.time's ZoneId.systemDefault() formatters.
 */

/** DateFormat.is24HourFormat's stand-in: the browser locale's clock convention. */
export function prefers24Hour(): boolean {
  return Intl.DateTimeFormat().resolvedOptions().hour12 === false;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Jul 17, 3:05 PM" or "Jul 17, 15:05" — DateTimeFormatter "MMM d, h:mm a" / "MMM d, HH:mm". */
export function formatDateTime(
  epochMillis: number,
  use24Hour: boolean,
  zone: string = systemZone(),
): string {
  const p = partsAt(epochMillis, zone);
  const date = `${MONTHS[p.month - 1]} ${p.day}`;
  if (use24Hour) {
    return `${date}, ${pad2(p.hour)}:${pad2(p.minute)}`;
  }
  const suffix = p.hour < 12 ? 'AM' : 'PM';
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${date}, ${hour12}:${pad2(p.minute)} ${suffix}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** "now", "in 5 min", "in 3 h", "in 2 d". */
export function relativeFuture(epochMillis: number, nowMillis: number): string {
  const minutes = Math.trunc((epochMillis - nowMillis) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `in ${minutes} min`;
  if (minutes < 60 * 24) return `in ${Math.trunc(minutes / 60)} h`;
  return `in ${Math.trunc(minutes / (60 * 24))} d`;
}

/** "45m", "4h", "1h 30m" — also used for the reminder's Wait button. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes % 60 === 0) return `${Math.trunc(minutes / 60)}h`;
  return `${Math.trunc(minutes / 60)}h ${minutes % 60}m`;
}

/** Monday-first short weekday names, matching the recurrence bitmask's bit order. */
export function shortWeekdayNames(style: 'short' | 'narrow' = 'short'): string[] {
  const formatter = new Intl.DateTimeFormat(undefined, { weekday: style, timeZone: 'UTC' });
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, i) => formatter.format(Date.UTC(2024, 0, 1 + i)));
}

/** "every day", "every 3 days", "every week", "every 2 weeks · Mon, Wed, Fri". */
export function recurrenceLabel(recurrence: Recurrence): string {
  const cadence =
    recurrence.unit === 'days'
      ? recurrence.everyN === 1
        ? 'every day'
        : `every ${recurrence.everyN} days`
      : recurrence.everyN === 1
        ? 'every week'
        : `every ${recurrence.everyN} weeks`;
  if (recurrence.unit !== 'weeks') return cadence;
  const names = shortWeekdayNames();
  const days = names.filter((_, index) => (recurrence.daysOfWeek & (1 << index)) !== 0).join(', ');
  return `${cadence} · ${days}`;
}

/** Bit for today's weekday, the natural starting selection. */
export function defaultWeekdayBit(nowMillis: number, zone: string = systemZone()): number {
  return 1 << dayOfWeek(dateAt(nowMillis, zone));
}
