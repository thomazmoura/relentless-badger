import { DailyOverview, DailyOverviewItem } from '../../core/domain/daily-overview';
import { epochFor, systemZone } from '../../core/domain/time';
import { renderDailyOverview } from './today-export';

// Ported from DailyOverviewTextTest.kt.
describe('renderDailyOverview', () => {
  // formatTimeOfDay renders in the system zone, so build the inputs from local
  // wall-clock times to keep the expected strings zone-independent.
  const at = (hour: number, minute: number): number =>
    epochFor({ year: 2026, month: 7, day: 15, hour, minute, second: 0, millis: 0 }, systemZone());

  const item = (
    title: string,
    hour: number,
    minute: number,
    fromEarlierDay = false,
  ): DailyOverviewItem => ({
    taskId: title,
    title,
    atMillis: at(hour, minute),
    fromEarlierDay,
    recurring: false,
  });

  const fullDay: DailyOverview = {
    now: [item('Buy milk', 9, 12), item('Call dentist', 11, 40)],
    later: [item('Water plants', 18, 0), item('Take pills', 22, 0)],
  };

  it('carries the whatsapp and telegram markers in markdown', () => {
    const text = renderDailyOverview(fullDay, true, 'markdown');

    expect(text).toBe(
      [
        '*RelentlessBadger — Today*',
        '',
        '*Now*',
        '• Buy milk _(since 09:12)_',
        '• Call dentist _(since 11:40)_',
        '',
        '*Later today*',
        '• Water plants _(18:00)_',
        '• Take pills _(22:00)_',
      ].join('\n'),
    );
  });

  it('renders plain as the same text without the markers', () => {
    const markdown = renderDailyOverview(fullDay, true, 'markdown');
    const plain = renderDailyOverview(fullDay, true, 'plain');

    expect(plain).toBe(markdown.replaceAll('*', '').replaceAll('_', ''));
  });

  it('leaves an empty section out entirely', () => {
    const laterOnly: DailyOverview = { now: [], later: [item('Water plants', 18, 0)] };

    const text = renderDailyOverview(laterOnly, true, 'markdown');

    expect(text).toBe(
      ['*RelentlessBadger — Today*', '', '*Later today*', '• Water plants _(18:00)_'].join('\n'),
    );
  });

  it('says so for an empty day', () => {
    const text = renderDailyOverview({ now: [], later: [] }, true, 'plain');

    expect(text).toBe('RelentlessBadger — Today\n\nNothing scheduled for today.');
  });

  it('spells out the date for a nag carried over from an earlier day', () => {
    const carriedOver: DailyOverview = { now: [item('Walk the dog', 18, 30, true)], later: [] };

    const text = renderDailyOverview(carriedOver, false, 'plain');

    expect(text).toBe('RelentlessBadger — Today\n\nNow\n• Walk the dog (since Jul 15, 6:30 PM)');
  });

  it('uses the am-pm clock when not in 24-hour mode', () => {
    const text = renderDailyOverview(fullDay, false, 'plain');

    expect(text).toBe(
      [
        'RelentlessBadger — Today',
        '',
        'Now',
        '• Buy milk (since 9:12 AM)',
        '• Call dentist (since 11:40 AM)',
        '',
        'Later today',
        '• Water plants (6:00 PM)',
        '• Take pills (10:00 PM)',
      ].join('\n'),
    );
  });
});
