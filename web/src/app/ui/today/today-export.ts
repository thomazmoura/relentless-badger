// Ported from DailyOverviewScreen.kt's export section.
import {
  DailyOverview,
  DailyOverviewItem,
  isOverviewEmpty,
  OverviewSectionKind,
} from '../../core/domain/daily-overview';
import { formatDateTime, formatTimeOfDay } from '../../core/domain/format';

export type OverviewTextStyle = 'markdown' | 'plain';

/** Angular templates read these too; these are the five a day can carry. */
export function sectionLabel(kind: OverviewSectionKind): string {
  switch (kind) {
    case 'now':
      return 'Now';
    case 'later':
      return 'Later today';
    case 'scheduled':
      return 'Scheduled';
    case 'overdue':
      return 'Overdue';
    case 'done':
      return 'Done';
  }
}

/**
 * The screen as a message. "markdown" carries the markers WhatsApp and Telegram
 * render (`*bold*`, `_italic_`); "plain" is the same text with those markers
 * dropped, for a clipboard that has no idea where it is going.
 */
export function renderDailyOverview(
  overview: DailyOverview,
  title: string,
  use24Hour: boolean,
  style: OverviewTextStyle,
): string {
  const bold = style === 'markdown' ? '*' : '';
  const italic = style === 'markdown' ? '_' : '';
  const lines = [`${bold}RelentlessBadger — ${title}${bold}`];

  if (isOverviewEmpty(overview)) {
    lines.push('', 'Nothing on this day.');
    return lines.join('\n');
  }

  for (const section of overview.sections) {
    lines.push('', `${bold}${sectionLabel(section.kind)}${bold}`);
    for (const item of section.items) {
      lines.push(
        `• ${item.title} ${italic}(${overviewTimeLabel(item, section.kind, use24Hour)})${italic}`,
      );
    }
  }
  return lines.join('\n');
}

/**
 * "since 09:12" for something already nagging, "was due 09:12" for a debt an
 * earlier day left behind, "done 09:12" for a completion, plain "18:00" for
 * what is still to come. A nag carried over from an earlier day gets its date
 * as well, since a bare "since 6:30 PM" at lunchtime reads as a time that has
 * not arrived yet.
 */
export function overviewTimeLabel(
  item: DailyOverviewItem,
  kind: OverviewSectionKind,
  use24Hour: boolean,
): string {
  const when = item.fromEarlierDay
    ? formatDateTime(item.atMillis, use24Hour)
    : formatTimeOfDay(item.atMillis, use24Hour);
  switch (kind) {
    case 'now':
      return `since ${when}`;
    case 'overdue':
      return `was due ${when}`;
    case 'done':
      return `done ${when}`;
    default:
      return when;
  }
}
