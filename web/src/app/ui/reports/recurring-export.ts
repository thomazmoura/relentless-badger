// Ported from RecurringReportScreen.kt's export section.
import {
  RecurringCadence,
  RecurringReport,
  RecurringReportItem,
} from '../../core/domain/recurring-report';
import { formatDateTime, formatTimeOfDay, recurrenceLabel } from '../../core/domain/format';
import { ENGLISH, Strings } from '../../core/i18n/strings';
import { OverviewTextStyle } from '../today/today-export';

/** The screen as a message, in the same two styles as renderDailyOverview. */
export function renderRecurringReport(
  report: RecurringReport,
  title: string,
  use24Hour: boolean,
  style: OverviewTextStyle,
  strings: Strings = ENGLISH,
): string {
  const bold = style === 'markdown' ? '*' : '';
  const italic = style === 'markdown' ? '_' : '';
  const lines = [`${bold}${strings.reportBrand} — ${title}${bold}`];

  if (report.sections.length === 0) {
    lines.push('', strings.noRecurringTasks);
    return lines.join('\n');
  }

  for (const section of report.sections) {
    lines.push('', `${bold}${cadenceLabel(section.cadence, strings)}${bold}`);
    for (const item of section.items) {
      lines.push(
        `• ${item.title} ` +
          `${italic}(${recurringScheduleLabel(item, use24Hour, strings)} · ` +
          `${recurringNextLabel(item, use24Hour, strings)})${italic}`,
      );
    }
  }
  return lines.join('\n');
}

/** "Daily", "Weekly", "Every 4 days", "Every 2 weeks". */
export function cadenceLabel(cadence: RecurringCadence, strings: Strings = ENGLISH): string {
  if (cadence.everyN === 1) {
    return cadence.unit === 'days' ? strings.cadenceDaily : strings.cadenceWeekly;
  }
  return cadence.unit === 'days'
    ? strings.cadenceEveryNDays(cadence.everyN)
    : strings.cadenceEveryNWeeks(cadence.everyN);
}

/** "every day at 09:00", "every 2 weeks · Mon, Wed at 6:30 PM". */
export function recurringScheduleLabel(
  item: RecurringReportItem,
  use24Hour: boolean,
  strings: Strings = ENGLISH,
): string {
  return strings.scheduleAt(
    recurrenceLabel(item.recurrence, strings),
    formatTimeOfDay(item.anchorMillis, use24Hour),
  );
}

/** "next Sep 28, 09:00", or "nagging since Sep 26, 09:00" once it has begun. */
export function recurringNextLabel(
  item: RecurringReportItem,
  use24Hour: boolean,
  strings: Strings = ENGLISH,
): string {
  const at = formatDateTime(item.nextAtMillis, use24Hour, undefined, strings);
  return item.nagging ? strings.naggingSince(at) : strings.nextAt(at);
}
