import { recurrenceOf } from '../../core/domain/models';
import { PORTUGUESE } from '../../core/i18n/strings';
import { RecurringReport, RecurringReportItem } from '../../core/domain/recurring-report';
import { epochFor, systemZone } from '../../core/domain/time';
import { cadenceLabel, renderRecurringReport } from './recurring-export';

// Ported from RecurringReportTextTest.kt.
describe('renderRecurringReport', () => {
  // The formatters render in the system zone, so build the inputs from local
  // wall-clock times to keep the expected strings zone-independent.
  const at = (day: number, hour: number, minute = 0): number =>
    epochFor({ year: 2026, month: 9, day, hour, minute, second: 0, millis: 0 }, systemZone());

  const pills: RecurringReportItem = {
    taskId: 'pills',
    title: 'Take pills',
    recurrence: recurrenceOf(1, 'days'),
    anchorMillis: at(26, 9),
    nextAtMillis: at(26, 9),
    nagging: true,
  };

  const bins: RecurringReportItem = {
    taskId: 'bins',
    title: 'Put the bins out',
    // Monday and Wednesday.
    recurrence: recurrenceOf(2, 'weeks', 0b101),
    anchorMillis: at(21, 18, 30),
    nextAtMillis: at(28, 18, 30),
    nagging: false,
  };

  const bothSections: RecurringReport = {
    sections: [
      { cadence: { everyN: 1, unit: 'days' }, items: [pills] },
      { cadence: { everyN: 2, unit: 'weeks' }, items: [bins] },
    ],
  };

  const binsOnly: RecurringReport = {
    sections: [{ cadence: { everyN: 2, unit: 'weeks' }, items: [bins] }],
  };

  it('carries the WhatsApp and Telegram markers in markdown', () => {
    const text = renderRecurringReport(bothSections, 'Recurring', true, 'markdown');

    expect(text).toBe(
      [
        '*RelentlessBadger — Recurring*',
        '',
        '*Daily*',
        '• Take pills _(every day at 09:00 · nagging since Sep 26, 09:00)_',
        '',
        '*Every 2 weeks*',
        '• Put the bins out _(every 2 weeks · Mon, Wed at 18:30 · next Sep 28, 18:30)_',
      ].join('\n'),
    );
  });

  it('drops the markers in plain and honours the 12-hour clock', () => {
    const text = renderRecurringReport(binsOnly, 'Recurring', false, 'plain');

    expect(text).toBe(
      [
        'RelentlessBadger — Recurring',
        '',
        'Every 2 weeks',
        '• Put the bins out (every 2 weeks · Mon, Wed at 6:30 PM · next Sep 28, 6:30 PM)',
      ].join('\n'),
    );
  });

  it('names sections after their interval', () => {
    expect(cadenceLabel({ everyN: 1, unit: 'days' })).toBe('Daily');
    expect(cadenceLabel({ everyN: 1, unit: 'weeks' })).toBe('Weekly');
    expect(cadenceLabel({ everyN: 4, unit: 'days' })).toBe('Every 4 days');
    expect(cadenceLabel({ everyN: 2, unit: 'weeks' })).toBe('Every 2 weeks');
  });

  it('says so when the report is empty', () => {
    const text = renderRecurringReport({ sections: [] }, 'Recurring', true, 'plain');

    expect(text).toBe('RelentlessBadger — Recurring\n\nNo recurring tasks.');
  });

  it('names the sections and the brand in Portuguese', () => {
    expect(cadenceLabel({ everyN: 4, unit: 'days' }, PORTUGUESE)).toBe('A cada 4 dias');
    expect(renderRecurringReport({ sections: [] }, 'Recorrentes', true, 'plain', PORTUGUESE)).toBe(
      'Texugo Insistente — Recorrentes\n\nNenhuma tarefa recorrente.',
    );
  });
});
