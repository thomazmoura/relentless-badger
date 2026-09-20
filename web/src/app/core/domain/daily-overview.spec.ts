import { buildDailyOverview, DailyOverview, overviewItems } from './daily-overview';
import { CompletedTask, OpenTask, Recurrence, recurrenceOf } from './models';
import { epochFor, LocalDate } from './time';

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

  const completedTask = (options: {
    id?: string;
    title?: string;
    completedAtMillis: number;
    cancelled?: boolean;
    seriesId?: string | null;
  }): CompletedTask => ({
    id: options.id ?? 'done',
    title: options.title ?? 'done',
    completedAtMillis: options.completedAtMillis,
    seriesId: options.seriesId ?? null,
    cancelled: options.cancelled ?? false,
  });

  /** The day `now` falls on, where the overview splits into now and later. */
  const today: LocalDate = { year: 2026, month: 7, day: 15 };

  const overview = (...tasks: OpenTask[]) => buildDailyOverview(tasks, [], today, now, false, zone);

  const overviewOf = (
    date: LocalDate,
    options: {
      openTasks?: OpenTask[];
      completed?: CompletedTask[];
      includeConcluded?: boolean;
    } = {},
  ) =>
    buildDailyOverview(
      options.openTasks ?? [],
      options.completed ?? [],
      date,
      now,
      options.includeConcluded ?? true,
      zone,
    );

  const nowItems = (result: DailyOverview) => overviewItems(result, 'now');
  const laterItems = (result: DailyOverview) => overviewItems(result, 'later');

  it('puts a task whose start has passed into now', () => {
    const result = overview(openTask({ firstWarningAtMillis: at(2026, 7, 15, 9, 12) }));

    expect(nowItems(result).map((item) => item.title)).toEqual(['task']);
    expect(laterItems(result)).toEqual([]);
  });

  it('puts a task starting later today into later', () => {
    const result = overview(openTask({ firstWarningAtMillis: at(2026, 7, 15, 18, 0) }));

    expect(nowItems(result)).toEqual([]);
    expect(laterItems(result).map((item) => item.title)).toEqual(['task']);
  });

  it('leaves a task starting tomorrow out of both sections', () => {
    const result = overview(openTask({ firstWarningAtMillis: at(2026, 7, 16, 9, 0) }));

    expect(nowItems(result), 'tomorrow belongs to the calendar, not today').toEqual([]);
    expect(laterItems(result)).toEqual([]);
  });

  it('keeps a task still nagging from yesterday in now', () => {
    const result = overview(openTask({ firstWarningAtMillis: at(2026, 7, 14, 21, 0) }));

    expect(nowItems(result).length).toBe(1);
    expect(
      nowItems(result)[0].atMillis,
      'the overview reports when it started, not when it next fires',
    ).toBe(at(2026, 7, 14, 21, 0));
    expect(
      nowItems(result)[0].fromEarlierDay,
      'a carried-over nag must be marked, so its label can carry the date',
    ).toBe(true);
  });

  it('does not mark a nag that began today as carried over', () => {
    const result = overview(openTask({ firstWarningAtMillis: at(2026, 7, 15, 9, 12) }));

    expect(nowItems(result)[0].fromEarlierDay).toBe(false);
  });

  it('keeps a snoozed task in now rather than jumping it to later', () => {
    // Snoozing pushes nextFire out but leaves the first warning alone.
    const result = overview(
      openTask({
        firstWarningAtMillis: at(2026, 7, 15, 9, 0),
        nextFireAtMillis: at(2026, 7, 15, 20, 0),
      }),
    );

    expect(nowItems(result).map((item) => item.title)).toEqual(['task']);
    expect(laterItems(result)).toEqual([]);
  });

  it('counts a task without a first warning as nagging and reports its delayed start', () => {
    const createdAtMillis = at(2026, 7, 15, 11, 30);
    const result = overview(openTask({ createdAtMillis, initialDelayMinutes: 60 }));

    expect(nowItems(result).length).toBe(1);
    expect(nowItems(result)[0].atMillis).toBe(createdAtMillis + 60 * 60_000);
  });

  it('returns both sections in time order', () => {
    const result = overview(
      openTask({ id: 'c', title: 'c', firstWarningAtMillis: at(2026, 7, 15, 22, 0) }),
      openTask({ id: 'a', title: 'a', firstWarningAtMillis: at(2026, 7, 15, 8, 0) }),
      openTask({ id: 'd', title: 'd', firstWarningAtMillis: at(2026, 7, 15, 18, 0) }),
      openTask({ id: 'b', title: 'b', firstWarningAtMillis: at(2026, 7, 15, 11, 0) }),
    );

    expect(nowItems(result).map((item) => item.title)).toEqual(['a', 'b']);
    expect(laterItems(result).map((item) => item.title)).toEqual(['d', 'c']);
  });

  it('flags a recurring occurrence and counts it once', () => {
    const result = overview(
      openTask({
        firstWarningAtMillis: at(2026, 7, 15, 18, 0),
        recurrence: recurrenceOf(1, 'days'),
      }),
    );

    expect(laterItems(result).length).toBe(1);
    expect(laterItems(result)[0].recurring).toBe(true);
  });

  it('does not flag a one-off as recurring', () => {
    const result = overview(openTask({ firstWarningAtMillis: at(2026, 7, 15, 18, 0) }));

    expect(laterItems(result)[0].recurring).toBe(false);
  });

  it('still counts a task starting at the last minute of the day as today', () => {
    const result = overview(openTask({ firstWarningAtMillis: at(2026, 7, 15, 23, 59) }));

    expect(laterItems(result).length).toBe(1);
  });

  // --- Other days ---------------------------------------------------------

  it('shows a still-open task as a past day being overdue', () => {
    const result = overviewOf(
      { year: 2026, month: 7, day: 13 },
      { openTasks: [openTask({ firstWarningAtMillis: at(2026, 7, 13, 9, 0) })] },
    );

    expect(overviewItems(result, 'overdue').map((item) => item.title)).toEqual(['task']);
    expect(
      result.sections.map((section) => section.kind),
      "now and later are today's question",
    ).toEqual(['overdue']);
  });

  it('does not charge a day with a task left over from a different one', () => {
    const result = overviewOf(
      { year: 2026, month: 7, day: 13 },
      { openTasks: [openTask({ firstWarningAtMillis: at(2026, 7, 14, 9, 0) })] },
    );

    expect(result.sections).toEqual([]);
  });

  it('reports what was completed on a past day', () => {
    const result = overviewOf(
      { year: 2026, month: 7, day: 13 },
      { completed: [completedTask({ completedAtMillis: at(2026, 7, 13, 16, 40) })] },
    );

    expect(overviewItems(result, 'done').map((item) => item.title)).toEqual(['done']);
    expect(overviewItems(result, 'done')[0].atMillis).toBe(at(2026, 7, 13, 16, 40));
  });

  it('never reports a cancellation as done', () => {
    const result = overviewOf(
      { year: 2026, month: 7, day: 13 },
      {
        completed: [completedTask({ completedAtMillis: at(2026, 7, 13, 16, 40), cancelled: true })],
      },
    );

    expect(result.sections, 'a cancellation must not read as an accomplishment').toEqual([]);
  });

  it('keeps completions out until they are asked for', () => {
    const completed = [completedTask({ completedAtMillis: at(2026, 7, 13, 16, 40) })];
    const date = { year: 2026, month: 7, day: 13 };

    expect(overviewOf(date, { completed, includeConcluded: false }).sections).toEqual([]);
    expect(overviewOf(date, { completed }).sections.length).toBe(1);
  });

  it('lets today show its completions alongside what is still owed', () => {
    const result = overviewOf(today, {
      openTasks: [openTask({ firstWarningAtMillis: at(2026, 7, 15, 9, 12) })],
      completed: [completedTask({ completedAtMillis: at(2026, 7, 15, 10, 0) })],
    });

    expect(result.sections.map((section) => section.kind)).toEqual(['now', 'done']);
  });

  it('shows a future day what is scheduled, never what is nagging', () => {
    const result = overviewOf(
      { year: 2026, month: 7, day: 17 },
      { openTasks: [openTask({ firstWarningAtMillis: at(2026, 7, 17, 8, 0) })] },
    );

    expect(result.sections.map((section) => section.kind)).toEqual(['scheduled']);
  });

  it('expands a repeating series onto a future day own occurrence', () => {
    // Anchored on Wednesday the 15th, so the series lands on the 22nd — a day
    // the current occurrence says nothing about.
    const result = overviewOf(
      { year: 2026, month: 7, day: 22 },
      {
        openTasks: [
          openTask({
            firstWarningAtMillis: at(2026, 7, 15, 18, 0),
            recurrence: recurrenceOf(1, 'weeks', 1 << 2),
          }),
        ],
      },
    );

    const scheduled = overviewItems(result, 'scheduled');
    expect(scheduled.length).toBe(1);
    expect(scheduled[0].atMillis).toBe(at(2026, 7, 22, 18, 0));
    expect(scheduled[0].recurring).toBe(true);
  });

  it('gives a day with nothing on it no sections at all', () => {
    expect(overviewOf({ year: 2026, month: 7, day: 13 }).sections).toEqual([]);
  });
});
