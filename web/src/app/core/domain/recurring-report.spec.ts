import { OpenTask, Recurrence, recurrenceOf } from './models';
import { buildRecurringReport, RecurringReport } from './recurring-report';
import { epochFor } from './time';

// Ported from RecurringReportTest.kt.
describe('buildRecurringReport', () => {
  const zone = 'America/New_York';

  const at = (year: number, month: number, day: number, hour: number, minute = 0): number =>
    epochFor({ year, month, day, hour, minute, second: 0, millis: 0 }, zone);

  /** Noon on a Wednesday. */
  const now = at(2026, 7, 15, 12, 0);

  const openTask = (
    id: string,
    firstWarningAtMillis: number | null,
    recurrence: Recurrence | null,
  ): OpenTask => ({
    id,
    title: id,
    createdAtMillis: now,
    initialDelayMinutes: 60,
    repeatIntervalMinutes: 15,
    firstWarningAtMillis,
    nextFireAtMillis: firstWarningAtMillis ?? now,
    recurEveryN: recurrence?.everyN ?? null,
    recurUnit: recurrence?.unit ?? null,
    recurDaysOfWeek: recurrence?.unit === 'weeks' ? recurrence.daysOfWeek : null,
    seriesId: recurrence ? id : null,
    pendingDone: false,
    pendingCreate: false,
    pendingUpdate: false,
    pendingReopen: false,
    pendingDelete: false,
  });

  const daily = recurrenceOf(1, 'days');

  const items = (report: RecurringReport) => report.sections.flatMap((section) => section.items);

  it('leaves one-off tasks out', () => {
    const report = buildRecurringReport(
      [openTask('once', at(2026, 7, 16, 9), null), openTask('daily', at(2026, 7, 16, 9), daily)],
      now,
    );

    expect(items(report).map((item) => item.taskId)).toEqual(['daily']);
  });

  it('runs a section through the day by the hour each series fires at', () => {
    const report = buildRecurringReport(
      [
        // Tomorrow's morning still comes first: the date is not the point.
        openTask('evening', at(2026, 7, 15, 20), daily),
        openTask('morning', at(2026, 7, 16, 9), daily),
        openTask('afternoon', at(2026, 7, 15, 15), daily),
      ],
      now,
      zone,
    );

    expect(items(report).map((item) => item.taskId)).toEqual(['morning', 'afternoon', 'evening']);
  });

  it('leads with daily and weekly, then gives each other interval its own section, shortest first', () => {
    const report = buildRecurringReport(
      [
        openTask('every 2 weeks', at(2026, 7, 20, 8), recurrenceOf(2, 'weeks', 1)),
        openTask('every 14 days', at(2026, 7, 20, 8), recurrenceOf(14, 'days')),
        openTask('every 4 days', at(2026, 7, 16, 9), recurrenceOf(4, 'days')),
        openTask('every 2 days', at(2026, 7, 16, 9), recurrenceOf(2, 'days')),
        openTask('weekly', at(2026, 7, 20, 8), recurrenceOf(1, 'weeks', 1)),
        openTask('daily', at(2026, 7, 16, 9), daily),
      ],
      now,
      zone,
    );

    expect(report.sections.map((section) => section.cadence)).toEqual([
      { everyN: 1, unit: 'days' },
      { everyN: 1, unit: 'weeks' },
      { everyN: 2, unit: 'days' },
      { everyN: 4, unit: 'days' },
      { everyN: 14, unit: 'days' },
      { everyN: 2, unit: 'weeks' },
    ]);
  });

  it('puts weekly series on different weekdays in one section', () => {
    const report = buildRecurringReport(
      [
        openTask('mondays', at(2026, 7, 20, 8), recurrenceOf(1, 'weeks', 1)),
        openTask('fridays', at(2026, 7, 17, 7), recurrenceOf(1, 'weeks', 16)),
      ],
      now,
      zone,
    );

    expect(report.sections.map((section) => section.items.map((item) => item.taskId))).toEqual([
      ['fridays', 'mondays'],
    ]);
  });

  it('gives an interval with no series no section', () => {
    const report = buildRecurringReport(
      [openTask('every 3 days', at(2026, 7, 16, 9), recurrenceOf(3, 'days'))],
      now,
      zone,
    );

    expect(report.sections.map((section) => section.cadence)).toEqual([
      { everyN: 3, unit: 'days' },
    ]);
  });

  it('reports an upcoming occurrence as next, not nagging', () => {
    const nextAt = at(2026, 7, 16, 9);
    const [item] = items(buildRecurringReport([openTask('daily', nextAt, daily)], now));

    expect(item.nagging).toBe(false);
    expect(item.nextAtMillis).toBe(nextAt);
    expect(item.recurrence).toEqual(daily);
  });

  it('reports an occurrence that has begun as nagging', () => {
    const startedAt = at(2026, 7, 15, 9);
    const [item] = items(buildRecurringReport([openTask('daily', startedAt, daily)], now));

    expect(item.nagging).toBe(true);
    expect(item.nextAtMillis).toBe(startedAt);
  });

  it('takes the hour from the series anchor', () => {
    const anchor = at(2026, 7, 16, 18, 30);
    const [item] = items(buildRecurringReport([openTask('daily', anchor, daily)], now));

    expect(item.anchorMillis).toBe(anchor);
  });
});
