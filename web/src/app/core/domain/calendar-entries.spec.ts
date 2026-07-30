import { buildMonthEntries, CalendarEntry } from './calendar-entries';
import { CompletedTask, OpenTask, Recurrence } from './models';
import { dateKey, epochFor, YearMonth } from './time';

// Ported from CalendarEntriesTest.kt. Days are looked up by their dateKey
// ("2026-07-10") since the map is keyed by value, not by a LocalDate object.
describe('buildMonthEntries', () => {
  const zone = 'America/New_York';
  const july: YearMonth = { year: 2026, month: 7 };

  const at = (year: number, month: number, day: number, hour: number, minute = 0): number =>
    epochFor({ year, month, day, hour, minute, second: 0, millis: 0 }, zone);

  const key = (year: number, month: number, day: number): string => dateKey({ year, month, day });

  const openTask = (options: {
    id?: string;
    title?: string;
    createdAtMillis: number;
    initialDelayMinutes?: number;
    firstWarningAtMillis?: number | null;
    recurrence?: Recurrence | null;
  }): OpenTask => {
    const id = options.id ?? 'task';
    const recurrence = options.recurrence ?? null;
    return {
      id,
      title: options.title ?? 'task',
      createdAtMillis: options.createdAtMillis,
      initialDelayMinutes: options.initialDelayMinutes ?? 60,
      repeatIntervalMinutes: 15,
      firstWarningAtMillis: options.firstWarningAtMillis ?? null,
      nextFireAtMillis: options.firstWarningAtMillis ?? options.createdAtMillis,
      recurEveryN: recurrence?.everyN ?? null,
      recurUnit: recurrence?.unit ?? null,
      recurDaysOfWeek: recurrence?.unit === 'weeks' ? recurrence.daysOfWeek : null,
      seriesId: recurrence ? id : null,
      pendingDone: false,
      pendingCreate: false,
      pendingUpdate: false,
    };
  };

  const completed = (
    id: string,
    title: string,
    atMillis: number,
    seriesId: string | null = null,
    cancelled = false,
  ): CompletedTask => ({ id, title, completedAtMillis: atMillis, seriesId, cancelled });

  const days = (options: {
    openTasks?: OpenTask[];
    completedTasks?: CompletedTask[];
    month?: YearMonth;
    includeCancelled?: boolean;
  }): Map<string, CalendarEntry[]> =>
    buildMonthEntries(
      options.openTasks ?? [],
      options.completedTasks ?? [],
      options.month ?? july,
      zone,
      options.includeCancelled ?? false,
    );

  it('completed task lands on its local calendar day', () => {
    const result = days({ completedTasks: [completed('a', 'walk dog', at(2026, 7, 10, 14))] });
    const day = result.get(key(2026, 7, 10))!;
    expect(day.map((e) => e.title)).toEqual(['walk dog']);
    expect(day[0].kind).toBe('completed');
  });

  it('completion near UTC midnight buckets by local date', () => {
    // 2026-07-11 01:30 UTC is still 2026-07-10 21:30 in New York.
    const utcLate = Date.UTC(2026, 6, 11, 1, 30);
    const result = days({ completedTasks: [completed('a', 'late', utcLate)] });
    expect(result.has(key(2026, 7, 10))).toBe(true);
    expect(result.has(key(2026, 7, 11))).toBe(false);
  });

  it('completions outside the month are excluded', () => {
    const result = days({
      completedTasks: [
        completed('a', 'june', at(2026, 6, 30, 23)),
        completed('b', 'august', at(2026, 8, 1, 0)),
      ],
    });
    expect(result.size).toBe(0);
  });

  it('one-shot task appears on its first warning day', () => {
    const result = days({
      openTasks: [
        openTask({ createdAtMillis: at(2026, 7, 1, 8), firstWarningAtMillis: at(2026, 7, 20, 9) }),
      ],
    });
    const day = result.get(key(2026, 7, 20))!;
    expect(day[0].kind).toBe('scheduled');
    expect(day[0].recurring).toBe(false);
  });

  it('one-shot without first warning appears at creation plus initial delay', () => {
    // Created 23:30 with a 60-minute delay: starts the *next* day.
    const result = days({
      openTasks: [openTask({ createdAtMillis: at(2026, 7, 5, 23, 30), initialDelayMinutes: 60 })],
    });
    expect(result.has(key(2026, 7, 5))).toBe(false);
    expect(result.get(key(2026, 7, 6))![0].atMillis).toBe(at(2026, 7, 6, 0, 30));
  });

  it('one-shot outside the month is absent', () => {
    const result = days({
      openTasks: [
        openTask({ createdAtMillis: at(2026, 7, 1, 8), firstWarningAtMillis: at(2026, 8, 2, 9) }),
      ],
    });
    expect(result.size).toBe(0);
  });

  it('daily recurrence anchored mid-month fills the rest of the month only', () => {
    const result = days({
      openTasks: [
        openTask({
          createdAtMillis: at(2026, 7, 10, 8),
          firstWarningAtMillis: at(2026, 7, 10, 9),
          recurrence: { everyN: 1, unit: 'days', daysOfWeek: 0 },
        }),
      ],
    });
    expect(result.has(key(2026, 7, 9))).toBe(false);
    for (let day = 10; day <= 31; day++) {
      expect(result.get(key(2026, 7, day))![0].atMillis).toBe(at(2026, 7, day, 9));
    }
  });

  it('every 3 days keeps its phase from an anchor in a previous month', () => {
    // Anchored 2026-06-28: occurrences 6/28, 7/1, 7/4 ... — aligned to the
    // anchor, not to the viewed month's first day.
    const result = days({
      openTasks: [
        openTask({
          createdAtMillis: at(2026, 6, 28, 9),
          firstWarningAtMillis: at(2026, 6, 28, 9),
          recurrence: { everyN: 3, unit: 'days', daysOfWeek: 0 },
        }),
      ],
    });
    const expected = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31].map((d) => key(2026, 7, d));
    expect([...result.keys()]).toEqual(expected);
  });

  it('biweekly Mon and Fri only fires in on-schedule weeks', () => {
    // Anchor Mon 2026-07-06; every 2 weeks on Mon|Fri: 7/6, 7/10, 7/20, 7/24.
    const result = days({
      openTasks: [
        openTask({
          createdAtMillis: at(2026, 7, 6, 9),
          firstWarningAtMillis: at(2026, 7, 6, 9),
          recurrence: { everyN: 2, unit: 'weeks', daysOfWeek: 0b0010001 },
        }),
      ],
    });
    expect([...result.keys()]).toEqual([6, 10, 20, 24].map((d) => key(2026, 7, d)));
  });

  it("a future month shows all of a recurring task's occurrences", () => {
    const result = days({
      openTasks: [
        openTask({
          createdAtMillis: at(2026, 7, 6, 9),
          firstWarningAtMillis: at(2026, 7, 6, 9),
          recurrence: { everyN: 1, unit: 'weeks', daysOfWeek: 0b0000001 },
        }),
      ],
      month: { year: 2026, month: 9 },
    });
    // Mondays of September 2026: 7, 14, 21, 28.
    expect([...result.keys()]).toEqual([7, 14, 21, 28].map((d) => key(2026, 9, d)));
  });

  it('entries within a day interleave completed and scheduled ascending', () => {
    const result = days({
      openTasks: [
        openTask({
          id: 's',
          title: 'scheduled',
          createdAtMillis: at(2026, 7, 15, 8),
          firstWarningAtMillis: at(2026, 7, 15, 12),
        }),
      ],
      completedTasks: [
        completed('c1', 'morning', at(2026, 7, 15, 9)),
        completed('c2', 'evening', at(2026, 7, 15, 18)),
      ],
    });
    expect(result.get(key(2026, 7, 15))!.map((e) => e.title)).toEqual([
      'morning',
      'scheduled',
      'evening',
    ]);
  });

  it('cancelled tasks are left out by default, leaving their day empty', () => {
    // No entries at all for that day, which is also what clears its dot.
    const cancelled = [completed('a', 'skipped', at(2026, 7, 10, 14), null, true)];
    expect(days({ completedTasks: cancelled }).size).toBe(0);
  });

  it('cancelled tasks appear as cancelled when asked for', () => {
    const result = days({
      completedTasks: [
        completed('a', 'skipped', at(2026, 7, 10, 14), null, true),
        completed('b', 'walk dog', at(2026, 7, 10, 15)),
      ],
      includeCancelled: true,
    });
    const day = result.get(key(2026, 7, 10))!;
    expect(day.map((e) => e.title)).toEqual(['skipped', 'walk dog']);
    expect(day.map((e) => e.kind)).toEqual(['cancelled', 'completed']);
  });

  it('completed occurrence of a series is marked recurring', () => {
    const result = days({
      completedTasks: [completed('a', 'meds', at(2026, 7, 3, 9), 'series')],
    });
    expect(result.get(key(2026, 7, 3))![0].recurring).toBe(true);
  });
});
