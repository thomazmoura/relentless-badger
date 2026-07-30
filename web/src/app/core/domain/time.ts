/**
 * The slice of java.time the app actually uses, rebuilt on Intl.
 *
 * The scheduling rules are defined in local wall time (a daily task at 09:00
 * stays at 09:00 across DST), so every conversion has to go through a named
 * zone rather than the host's fixed offset. Keeping this module free of Date's
 * local-time methods means specs can pass an explicit IANA zone and never
 * depend on the machine's TZ, exactly like the Kotlin tests pass a ZoneId.
 */

export interface LocalDate {
  readonly year: number;
  readonly month: number; // 1..12
  readonly day: number; // 1..31
}

export interface LocalTime {
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millis: number;
}

export interface LocalDateTime extends LocalDate, LocalTime {}

export function systemZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(zone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      era: 'short',
    });
    formatterCache.set(zone, formatter);
  }
  return formatter;
}

/** The wall-clock reading of an instant in [zone] — Instant.atZone(zone). */
export function partsAt(millis: number, zone: string): LocalDateTime {
  const parts = partsFormatter(zone).formatToParts(millis);
  const field = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type);
    return found ? Number(found.value) : 0;
  };
  const bc = parts.find((p) => p.type === 'era')?.value.startsWith('B');
  const year = field('year');
  return {
    // Intl reports year 1 BC as era "BC" year 1; the proleptic year is 0.
    year: bc ? 1 - year : year,
    month: field('month'),
    day: field('day'),
    hour: field('hour') % 24,
    minute: field('minute'),
    second: field('second'),
    millis: ((millis % 1000) + 1000) % 1000,
  };
}

export function dateAt(millis: number, zone: string): LocalDate {
  const { year, month, day } = partsAt(millis, zone);
  return { year, month, day };
}

export function timeAt(millis: number, zone: string): LocalTime {
  const { hour, minute, second, millis: ms } = partsAt(millis, zone);
  return { hour, minute, second, millis: ms };
}

/** Zone offset in milliseconds (east of UTC positive) in effect at [millis]. */
export function offsetAt(millis: number, zone: string): number {
  const p = partsAt(millis, zone);
  return asUtc(p) - (millis - p.millis);
}

/** The same wall-clock reading interpreted as UTC. Sub-second is carried separately. */
function asUtc(p: LocalDateTime): number {
  // setUTCFullYear rather than Date.UTC, which folds years 0..99 into 1900..1999.
  const d = new Date(0);
  d.setUTCFullYear(p.year, p.month - 1, p.day);
  d.setUTCHours(p.hour, p.minute, p.second, 0);
  return d.getTime();
}

/**
 * The instant a wall-clock reading names in [zone] — LocalDateTime.atZone().
 * Resolves the two awkward cases the same way java.time does: a time inside a
 * DST gap is pushed forward by the gap, and an ambiguous time in an overlap
 * takes the earlier of the two offsets.
 */
export function epochFor(local: LocalDateTime, zone: string): number {
  const wall = asUtc(local) + local.millis;
  const offsetA = offsetAt(wall, zone);
  const offsetB = offsetAt(wall - offsetA, zone);
  if (offsetA === offsetB) {
    return wall - offsetA;
  }
  const validA = matchesWall(wall - offsetA, local, zone);
  const validB = matchesWall(wall - offsetB, local, zone);
  if (validA && validB) {
    return wall - Math.max(offsetA, offsetB); // overlap: earlier offset wins
  }
  if (validA) return wall - offsetA;
  if (validB) return wall - offsetB;
  return wall - Math.min(offsetA, offsetB); // gap: shifted forward by its length
}

function matchesWall(millis: number, local: LocalDateTime, zone: string): boolean {
  const p = partsAt(millis, zone);
  return (
    p.year === local.year &&
    p.month === local.month &&
    p.day === local.day &&
    p.hour === local.hour &&
    p.minute === local.minute &&
    p.second === local.second
  );
}

/** The instant of [time] on [date] in [zone] — LocalDate.atTime(t).atZone(zone). */
export function atTimeOn(date: LocalDate, time: LocalTime, zone: string): number {
  return epochFor({ ...date, ...time }, zone);
}

export function startOfDay(date: LocalDate, zone: string): number {
  return epochFor({ ...date, hour: 0, minute: 0, second: 0, millis: 0 }, zone);
}

// --- LocalDate arithmetic (timezone-free, proleptic Gregorian) ---------------

/** Days since 1970-01-01. Hinnant's civil-to-days algorithm. */
export function toEpochDay(date: LocalDate): number {
  const y = date.year - (date.month <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (date.month + (date.month > 2 ? -3 : 9)) + 2) / 5) + date.day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function fromEpochDay(epochDay: number): LocalDate {
  const z = epochDay + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  return { year: y + (month <= 2 ? 1 : 0), month, day };
}

export function plusDays(date: LocalDate, days: number): LocalDate {
  return fromEpochDay(toEpochDay(date) + days);
}

/** ChronoUnit.DAYS.between */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return toEpochDay(to) - toEpochDay(from);
}

/** ChronoUnit.WEEKS.between — whole weeks, truncated toward zero. */
export function weeksBetween(from: LocalDate, to: LocalDate): number {
  return Math.trunc(daysBetween(from, to) / 7);
}

/** 0 = Monday .. 6 = Sunday, matching the recurrence bitmask. */
export function dayOfWeek(date: LocalDate): number {
  const epochDay = toEpochDay(date);
  return (((epochDay + 3) % 7) + 7) % 7; // 1970-01-01 was a Thursday
}

/** TemporalAdjusters.previousOrSame(MONDAY) */
export function previousOrSameMonday(date: LocalDate): LocalDate {
  return plusDays(date, -dayOfWeek(date));
}

// --- YearMonth --------------------------------------------------------------

export interface YearMonth {
  readonly year: number;
  readonly month: number;
}

export function yearMonthOf(millis: number, zone: string): YearMonth {
  const { year, month } = dateAt(millis, zone);
  return { year, month };
}

export function plusMonths(ym: YearMonth, months: number): YearMonth {
  const total = ym.year * 12 + (ym.month - 1) + months;
  return { year: Math.floor(total / 12), month: (((total % 12) + 12) % 12) + 1 };
}

export function atDay(ym: YearMonth, day: number): LocalDate {
  return { year: ym.year, month: ym.month, day };
}

export function lengthOfMonth(ym: YearMonth): number {
  return daysBetween(atDay(ym, 1), atDay(plusMonths(ym, 1), 1));
}

export function sameYearMonth(a: YearMonth, b: YearMonth): boolean {
  return a.year === b.year && a.month === b.month;
}

export function sameDate(a: LocalDate, b: LocalDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** Stable key for grouping/lookup by day, e.g. "2026-07-17". */
export function dateKey(date: LocalDate): string {
  const mm = String(date.month).padStart(2, '0');
  const dd = String(date.day).padStart(2, '0');
  return `${date.year}-${mm}-${dd}`;
}

// --- ISO-8601 instants (the wire format) ------------------------------------

/** Instant.ofEpochMilli(x).toString() */
export function toIsoInstant(millis: number): string {
  return new Date(millis).toISOString();
}

/** Instant.parse(x).toEpochMilli() */
export function parseIsoInstant(text: string): number {
  const millis = Date.parse(text);
  if (Number.isNaN(millis)) {
    throw new Error(`Not an ISO-8601 instant: ${text}`);
  }
  return millis;
}
