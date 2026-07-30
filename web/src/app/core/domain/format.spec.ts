import { formatDateTime, formatDuration, recurrenceLabel, relativeFuture } from './format';
import { epochFor } from './time';

// Ported from FormatDateTimeTest.kt, plus the other MainScreen helpers.
describe('formatDateTime', () => {
  const zone = 'America/New_York';
  const afternoon = epochFor(
    { year: 2026, month: 7, day: 17, hour: 15, minute: 5, second: 0, millis: 0 },
    zone,
  );

  it('12-hour format uses am-pm clock', () => {
    expect(formatDateTime(afternoon, false, zone)).toBe('Jul 17, 3:05 PM');
  });

  it('24-hour format uses zero-padded 24h clock', () => {
    expect(formatDateTime(afternoon, true, zone)).toBe('Jul 17, 15:05');
  });

  it('renders midnight and noon on the 12-hour clock', () => {
    const midnight = epochFor(
      { year: 2026, month: 7, day: 17, hour: 0, minute: 0, second: 0, millis: 0 },
      zone,
    );
    const noon = epochFor(
      { year: 2026, month: 7, day: 17, hour: 12, minute: 0, second: 0, millis: 0 },
      zone,
    );
    expect(formatDateTime(midnight, false, zone)).toBe('Jul 17, 12:00 AM');
    expect(formatDateTime(noon, false, zone)).toBe('Jul 17, 12:00 PM');
  });
});

describe('relativeFuture', () => {
  const now = 1_000_000_000;
  const minute = 60_000;

  it('collapses anything under a minute to "now"', () => {
    expect(relativeFuture(now + 30_000, now)).toBe('now');
    expect(relativeFuture(now - 5 * minute, now)).toBe('now');
  });

  it('counts minutes, then hours, then days', () => {
    expect(relativeFuture(now + 5 * minute, now)).toBe('in 5 min');
    expect(relativeFuture(now + 59 * minute, now)).toBe('in 59 min');
    expect(relativeFuture(now + 90 * minute, now)).toBe('in 1 h');
    expect(relativeFuture(now + 30 * 60 * minute, now)).toBe('in 1 d');
  });
});

describe('formatDuration', () => {
  it('renders minutes, whole hours and mixed durations', () => {
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(240)).toBe('4h');
    expect(formatDuration(90)).toBe('1h 30m');
  });
});

describe('recurrenceLabel', () => {
  it('names daily and weekly cadences', () => {
    expect(recurrenceLabel({ everyN: 1, unit: 'days', daysOfWeek: 0 })).toBe('every day');
    expect(recurrenceLabel({ everyN: 3, unit: 'days', daysOfWeek: 0 })).toBe('every 3 days');
    expect(recurrenceLabel({ everyN: 1, unit: 'weeks', daysOfWeek: 0b0000001 })).toMatch(
      /^every week · /,
    );
  });

  it('lists the marked weekdays Monday-first', () => {
    const label = recurrenceLabel({ everyN: 2, unit: 'weeks', daysOfWeek: 0b0010101 });
    const [cadence, days] = label.split(' · ');
    expect(cadence).toBe('every 2 weeks');
    expect(days.split(', ').length).toBe(3);
  });
});
