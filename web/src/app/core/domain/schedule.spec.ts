import { computeNextFire, computeNextOccurrence } from './schedule';
import { recurrenceOf } from './models';
import { epochFor } from './time';

// Ported from ComputeNextFireTest.kt and ComputeNextOccurrenceTest.kt.
const minute = 60_000;

describe('computeNextFire', () => {
  it('first reminder fires initialDelay after creation', () => {
    const createdAt = 1_000_000;
    const next = computeNextFire(createdAt, 60, 15, createdAt + 10 * minute);
    expect(next).toBe(createdAt + 60 * minute);
  });

  it('after the first reminder it repeats on the interval', () => {
    const createdAt = 1_000_000;
    // 70 min in: first fire (60m) passed, next repeat lands at 75m.
    const next = computeNextFire(createdAt, 60, 15, createdAt + 70 * minute);
    expect(next).toBe(createdAt + 75 * minute);
  });

  it('next fire is always in the future', () => {
    const now = 1000 * minute;
    const next = computeNextFire(0, 60, 15, now);
    expect(next).toBeGreaterThan(now);
    expect(next - now).toBeLessThanOrEqual(15 * minute);
  });

  it('future first-warning time overrides the initial delay', () => {
    const createdAt = 1_000_000;
    const firstWarning = createdAt + 500 * minute;
    const next = computeNextFire(createdAt, 60, 15, createdAt + 10 * minute, firstWarning);
    expect(next).toBe(firstWarning);
  });

  it('past first-warning time aligns onto the interval', () => {
    const createdAt = 1_000_000;
    const firstWarning = createdAt + 60 * minute;
    // 70 min in: first-warning (60m) passed, next repeat lands at 75m.
    const next = computeNextFire(createdAt, 999, 15, createdAt + 70 * minute, firstWarning);
    expect(next).toBe(createdAt + 75 * minute);
  });
});

describe('computeNextOccurrence', () => {
  const zone = 'America/New_York';
  const at = (year: number, month: number, day: number, hour: number, minute = 0): number =>
    epochFor({ year, month, day, hour, minute, second: 0, millis: 0 }, zone);

  const monWedFri = 0b0010101;
  const daily = recurrenceOf(1, 'days');

  it('daily recurrence fires the next day at the same time', () => {
    // Anchor Fri 2026-07-10 09:00, completed same day 14:00.
    expect(computeNextOccurrence(at(2026, 7, 10, 9), daily, at(2026, 7, 10, 14), zone)).toBe(
      at(2026, 7, 11, 9),
    );
  });

  it('every 3 days steps from the anchor date', () => {
    const rec = recurrenceOf(3, 'days');
    expect(computeNextOccurrence(at(2026, 7, 10, 9), rec, at(2026, 7, 10, 14), zone)).toBe(
      at(2026, 7, 13, 9),
    );
  });

  it('completing before the anchor time still yields a strictly future occurrence', () => {
    // Completed at 08:00, an hour before the 09:00 occurrence even nagged: the
    // next slot is tomorrow, not today's own anchor.
    expect(computeNextOccurrence(at(2026, 7, 10, 9), daily, at(2026, 7, 10, 8), zone)).toBe(
      at(2026, 7, 11, 9),
    );
  });

  it('months of missed occurrences collapse into a single future one', () => {
    expect(computeNextOccurrence(at(2026, 1, 5, 9), daily, at(2026, 7, 10, 14), zone)).toBe(
      at(2026, 7, 11, 9),
    );
  });

  it('weekly bitmask picks the next marked day in the same week', () => {
    // Anchor Mon 2026-07-06 09:00 (Mon/Wed/Fri), completed Tue.
    const rec = recurrenceOf(1, 'weeks', monWedFri);
    expect(computeNextOccurrence(at(2026, 7, 6, 9), rec, at(2026, 7, 7, 10), zone)).toBe(
      at(2026, 7, 8, 9),
    );
  });

  it('weekly bitmask wraps to the next week after the last marked day', () => {
    // Completed Fri after the 09:00 slot; next is Monday.
    const rec = recurrenceOf(1, 'weeks', monWedFri);
    expect(computeNextOccurrence(at(2026, 7, 6, 9), rec, at(2026, 7, 10, 10), zone)).toBe(
      at(2026, 7, 13, 9),
    );
  });

  it('every 2 weeks skips the off week', () => {
    // Anchor Mon 2026-07-06; completing late in an off week (2026-07-15) must
    // land on the next on-week's Monday, not the off week's days.
    const rec = recurrenceOf(2, 'weeks', 0b0000001);
    expect(computeNextOccurrence(at(2026, 7, 6, 9), rec, at(2026, 7, 15, 10), zone)).toBe(
      at(2026, 7, 20, 9),
    );
  });

  it('anchor weekday outside the bitmask defers to the marked days', () => {
    // First occurrence hand-picked on Wed 2026-07-08, but the rule says Monday:
    // completing Wednesday moves to next week's Monday.
    const rec = recurrenceOf(1, 'weeks', 0b0000001);
    expect(computeNextOccurrence(at(2026, 7, 8, 9), rec, at(2026, 7, 8, 10), zone)).toBe(
      at(2026, 7, 13, 9),
    );
  });

  it('occurrences keep their wall-clock time across DST', () => {
    // US spring-forward was 2026-03-08: daily 09:00 stays 09:00 even though the
    // UTC offset changed under it.
    const next = computeNextOccurrence(at(2026, 3, 7, 9), daily, at(2026, 3, 7, 10), zone);
    expect(next).toBe(at(2026, 3, 8, 9));
    expect(next - at(2026, 3, 7, 9)).toBe(23 * 60 * minute); // the short day
  });

  it('weekly recurrence requires a non-empty bitmask', () => {
    expect(() => recurrenceOf(1, 'weeks', 0)).toThrow();
  });

  it('everyN below 1 is rejected', () => {
    expect(() => recurrenceOf(0, 'days')).toThrow();
  });
});
