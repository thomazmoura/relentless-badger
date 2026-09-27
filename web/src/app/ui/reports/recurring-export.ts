// Ported from RecurringReportScreen.kt's export section.
import {
  RecurringCadence,
  RecurringReport,
  RecurringReportItem,
} from '../../core/domain/recurring-report';
import { formatDateTime, formatTimeOfDay, recurrenceLabel } from '../../core/domain/format';
import { OverviewTextStyle } from '../today/today-export';

/** The screen as a message, in the same two styles as renderDailyOverview. */
export function renderRecurringReport(
  report: RecurringReport,
  title: string,
  use24Hour: boolean,
  style: OverviewTextStyle,
): string {
  const bold = style === 'markdown' ? '*' : '';
  const italic = style === 'markdown' ? '_' : '';
  const lines = [`${bold}RelentlessBadger — ${title}${bold}`];

  if (report.sections.length === 0) {
    lines.push('', 'No recurring tasks.');
    return lines.join('\n');
  }

  for (const section of report.sections) {
    lines.push('', `${bold}${cadenceLabel(section.cadence)}${bold}`);
    for (const item of section.items) {
      lines.push(
        `• ${item.title} ` +
          `${italic}(${recurringScheduleLabel(item, use24Hour)} · ${recurringNextLabel(item, use24Hour)})${italic}`,
      );
    }
  }
  return lines.join('\n');
}

/** "Daily", "Weekly", "Every 4 days", "Every 2 weeks". */
export function cadenceLabel(cadence: RecurringCadence): string {
  if (cadence.everyN === 1) return cadence.unit === 'days' ? 'Daily' : 'Weekly';
  return `Every ${cadence.everyN} ${cadence.unit}`;
}

/** "every day at 09:00", "every 2 weeks · Mon, Wed at 6:30 PM". */
export function recurringScheduleLabel(item: RecurringReportItem, use24Hour: boolean): string {
  return `${recurrenceLabel(item.recurrence)} at ${formatTimeOfDay(item.anchorMillis, use24Hour)}`;
}

/** "next Sep 28, 09:00", or "nagging since Sep 26, 09:00" once it has begun. */
export function recurringNextLabel(item: RecurringReportItem, use24Hour: boolean): string {
  const at = formatDateTime(item.nextAtMillis, use24Hour);
  return item.nagging ? `nagging since ${at}` : `next ${at}`;
}
