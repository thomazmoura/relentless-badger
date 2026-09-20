import { buildDailyOverview } from './daily-overview';
import { OpenTask, Recurrence, recurrenceOf } from './models';
import { epochFor } from './time';

// Ported from DailyOverviewTest.kt.
describe('buildDailyOverview', () => {
  const zone = 'America/New_York';

  const at = (year: number, month: number, day: number, hour: number, minute = 0): number =>
    epochFor({ year, month, day, hour, minute, second: 0, millis: 0 }, zone);

  /** Noon on a Wednesday — far enough from either midnight to be unambiguous. */
  const now = at(2026, 7, 15, 12, 0);

  const openTask = (options: {
    id?: string;
    title?: string;
    createdAtMillis?: number;
    initialDelayMinutes?: number;
    firstWarningAtMillis?: number | null;
    nextFireAtMillis?: number;
    recurrence?: Recurrence | null;
  }): OpenTask => {
    const id = options.id ?? 'task';
    const createdAtMillis = options.createdAtMillis ?? now;
    const firstWarningAtMillis = options.firstWarningAtMillis ?? null;
    const recurrence = options.recurrence ?? null;
    return {
      id,
      title: options.title ?? 'task',
      createdAtMillis,
      initialDelayMinutes: options.initialDelayMinutes ?? 60,
      repeatIntervalMinutes: 15,
      firstWarningAtMillis,
      nextFireAtMillis: options.nextFireAtMillis ?? firstWarningAtMillis ?? createdAtMillis,
      recurEveryN: recurrence?.everyN ?? null,
      recurUnit: recurrence?.unit ?? null,
      recurDaysOfWeek: recurrence?.unit === 'weeks' ? recurrence.daysOfWeek : null,
      seriesId: recurrence ? id : null,
      pendingDone: false,
      pendingCreate: false,
      pendingUpdate: false,
      pendingReopen: false,
      pendingDelete: false,
    };
  };

  const overview = (...tasks: OpenTask[]) => buildDailyOverview(tasks, now, zone);

  it('puts a task whose start has passed into now', () => {
    const result = overview(openTask({ firstWarningAtMillis: at(2026, 7, 15, 9, 12) }));

    expect(result.now.map((item) => item.title)).toEqual(['task']);
    expect(result.later).toEqual([]);
  });

  it('puts a task starting later today into later', () => {
    const result = overview(openTask({ firstWarningAtMillis: at(2026, 7, 15, 18, 0) }));

    expect(result.now).toEqual([]);
    expect(result.later.map((item) => item.title)).toEqual(['task']);
  });

  it('leaves a task starting tomorrow out of both sections', () => {
    const result = overview(openTask({ firstWarningAtMillis: at(2026, 7, 16, 9, 0) }));

    expect(result.now, 'tomorrow belongs to the calendar, not today').toEqual([]);
    expect(result.later).toEqual([]);
  });

  it('keeps a task still nagging from yesterday in now', () => {
    const result = overview(openTask({ firstWarningAtMillis: at(2026, 7, 14, 21, 0) }));

    expect(result.now.length).toBe(1);
    expect(
      result.now[0].atMillis,
      'the overview reports when it started, not when it next fires',
    ).toBe(at(2026, 7, 14, 21, 0));
    expect(
      result.now[0].fromEarlierDay,
      'a carried-over nag must be marked, so its label can carry the date',
    ).toBe(true);
  });

  it('does not mark a nag that began today as carried over', () => {
    const result = overview(openTask({ firstWarningAtMillis: at(2026, 7, 15, 9, 12) }));

    expect(result.now[0].fromEarlierDay).toBe(false);
  });

  it('keeps a snoozed task in now rather than jumping it to later', () => {
    // Snoozing pushes nextFire out but leaves the first warning alone.
    const result = overview(
      openTask({
        firstWarningAtMillis: at(2026, 7, 15, 9, 0),
        nextFireAtMillis: at(2026, 7, 15, 20, 0),
      }),
    );

    expect(result.now.map((item) => item.title)).toEqual(['task']);
    expect(result.later).toEqual([]);
  });

  it('counts a task without a first warning as nagging and reports its delayed start', () => {
    const createdAtMillis = at(2026, 7, 15, 11, 30);
    const result = overview(openTask({ createdAtMillis, initialDelayMinutes: 60 }));

    expect(result.now.length).toBe(1);
    expect(result.now[0].atMillis).toBe(createdAtMillis + 60 * 60_000);
  });

  it('returns both sections in time order', () => {
    const result = overview(
      openTask({ id: 'c', title: 'c', firstWarningAtMillis: at(2026, 7, 15, 22, 0) }),
      openTask({ id: 'a', title: 'a', firstWarningAtMillis: at(2026, 7, 15, 8, 0) }),
      openTask({ id: 'd', title: 'd', firstWarningAtMillis: at(2026, 7, 15, 18, 0) }),
      openTask({ id: 'b', title: 'b', firstWarningAtMillis: at(2026, 7, 15, 11, 0) }),
    );

    expect(result.now.map((item) => item.title)).toEqual(['a', 'b']);
    expect(result.later.map((item) => item.title)).toEqual(['d', 'c']);
  });

  it('flags a recurring occurrence and counts it once', () => {
    const result = overview(
      openTask({
        firstWarningAtMillis: at(2026, 7, 15, 18, 0),
        recurrence: recurrenceOf(1, 'days'),
      }),
    );

    expect(result.later.length).toBe(1);
    expect(result.later[0].recurring).toBe(true);
  });

  it('does not flag a one-off as recurring', () => {
    const result = overview(openTask({ firstWarningAtMillis: at(2026, 7, 15, 18, 0) }));

    expect(result.later[0].recurring).toBe(false);
  });

  it('still counts a task starting at the last minute of the day as today', () => {
    const result = overview(openTask({ firstWarningAtMillis: at(2026, 7, 15, 23, 59) }));

    expect(result.later.length).toBe(1);
  });
});
