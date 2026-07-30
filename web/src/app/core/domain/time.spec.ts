import {
  atDay,
  dateAt,
  dateKey,
  dayOfWeek,
  daysBetween,
  epochFor,
  fromEpochDay,
  lengthOfMonth,
  offsetAt,
  partsAt,
  plusDays,
  plusMonths,
  previousOrSameMonday,
  toEpochDay,
  weeksBetween,
} from './time';

// This module stands in for java.time, so it gets its own tests: everything
// downstream (recurrence expansion, the calendar) assumes it behaves like the
// JVM's, including the two DST edge cases.
describe('wall-clock conversions', () => {
  const ny = 'America/New_York';
  const wall = (hour: number, minute = 0, day = 17) => ({
    year: 2026,
    month: 7,
    day,
    hour,
    minute,
    second: 0,
    millis: 0,
  });

  it('round-trips a local time through its zone', () => {
    const millis = epochFor(wall(15, 5), ny);
    expect(partsAt(millis, ny)).toEqual(wall(15, 5));
  });

  it('reports the zone offset in effect', () => {
    expect(offsetAt(epochFor(wall(12), ny), ny)).toBe(-4 * 3_600_000); // EDT
    expect(offsetAt(Date.UTC(2026, 0, 15), ny)).toBe(-5 * 3_600_000); // EST
  });

  it('pushes a time inside the spring-forward gap out by the gap', () => {
    // 2026-03-08 02:30 does not exist in New York; java.time returns 03:30 EDT.
    const gap = epochFor(
      { year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0, millis: 0 },
      ny,
    );
    expect(partsAt(gap, ny).hour).toBe(3);
    expect(partsAt(gap, ny).minute).toBe(30);
  });

  it('takes the earlier offset for an ambiguous time in the fall-back overlap', () => {
    // 2026-11-01 01:30 happens twice; the earlier one is still EDT (-4).
    const overlap = epochFor(
      { year: 2026, month: 11, day: 1, hour: 1, minute: 30, second: 0, millis: 0 },
      ny,
    );
    expect(offsetAt(overlap, ny)).toBe(-4 * 3_600_000);
  });

  it('keeps dates stable across zones for the same instant', () => {
    const instant = Date.UTC(2026, 6, 11, 1, 30);
    expect(dateKey(dateAt(instant, ny))).toBe('2026-07-10');
    expect(dateKey(dateAt(instant, 'UTC'))).toBe('2026-07-11');
  });
});

describe('LocalDate arithmetic', () => {
  it('converts to and from epoch days', () => {
    expect(toEpochDay({ year: 1970, month: 1, day: 1 })).toBe(0);
    expect(toEpochDay({ year: 2026, month: 7, day: 17 })).toBe(20651);
    expect(fromEpochDay(20651)).toEqual({ year: 2026, month: 7, day: 17 });
    expect(fromEpochDay(-1)).toEqual({ year: 1969, month: 12, day: 31 });
  });

  it('counts days and whole weeks between dates', () => {
    const from = { year: 2026, month: 7, day: 6 };
    expect(daysBetween(from, { year: 2026, month: 7, day: 20 })).toBe(14);
    expect(weeksBetween(from, { year: 2026, month: 7, day: 19 })).toBe(1);
    expect(daysBetween({ year: 2026, month: 7, day: 20 }, from)).toBe(-14);
  });

  it('numbers weekdays Monday-first and finds the week start', () => {
    expect(dayOfWeek({ year: 2026, month: 7, day: 6 })).toBe(0); // Monday
    expect(dayOfWeek({ year: 2026, month: 7, day: 12 })).toBe(6); // Sunday
    expect(previousOrSameMonday({ year: 2026, month: 7, day: 12 })).toEqual({
      year: 2026,
      month: 7,
      day: 6,
    });
    expect(previousOrSameMonday({ year: 2026, month: 7, day: 6 })).toEqual({
      year: 2026,
      month: 7,
      day: 6,
    });
  });

  it('adds days across month and year boundaries', () => {
    expect(plusDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({
      year: 2027,
      month: 1,
      day: 1,
    });
    expect(plusDays({ year: 2024, month: 2, day: 28 }, 1)).toEqual({
      year: 2024,
      month: 2,
      day: 29,
    });
  });
});

describe('YearMonth', () => {
  it('walks months and measures their length', () => {
    expect(plusMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(plusMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(lengthOfMonth({ year: 2026, month: 2 })).toBe(28);
    expect(lengthOfMonth({ year: 2024, month: 2 })).toBe(29);
    expect(atDay({ year: 2026, month: 7 }, 1)).toEqual({ year: 2026, month: 7, day: 1 });
  });
});
