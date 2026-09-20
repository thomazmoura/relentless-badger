import {
  DailyOverview,
  DailyOverviewItem,
  isOverviewEmpty,
} from '../../core/domain/daily-overview';
import { formatDateTime, formatTimeOfDay } from '../../core/domain/format';

export type OverviewTextStyle = 'markdown' | 'plain';

/**
 * The screen as a message. "markdown" carries the markers WhatsApp and Telegram
 * render (`*bold*`, `_italic_`); "plain" is the same text with those markers
 * dropped, for a clipboard that has no idea where it is going.
 */
export function renderDailyOverview(
  overview: DailyOverview,
  use24Hour: boolean,
  style: OverviewTextStyle,
): string {
  const bold = style === 'markdown' ? '*' : '';
  const italic = style === 'markdown' ? '_' : '';
  const lines = [`${bold}RelentlessBadger — Today${bold}`];

  if (isOverviewEmpty(overview)) {
    lines.push('', 'Nothing scheduled for today.');
    return lines.join('\n');
  }

  const section = (label: string, items: readonly DailyOverviewItem[], nagging: boolean): void => {
    if (items.length === 0) return;
    lines.push('', `${bold}${label}${bold}`);
    for (const item of items) {
      lines.push(
        `• ${item.title} ${italic}(${overviewTimeLabel(item, nagging, use24Hour)})${italic}`,
      );
    }
  };

  section('Now', overview.now, true);
  section('Later today', overview.later, false);
  return lines.join('\n');
}

/**
 * "since 09:12" for something already nagging, plain "18:00" for what is still
 * to come. A nag carried over from an earlier day gets its date as well, since
 * a bare "since 6:30 PM" at lunchtime reads as a time that has not arrived yet.
 */
export function overviewTimeLabel(
  item: DailyOverviewItem,
  nagging: boolean,
  use24Hour: boolean,
): string {
  const when = item.fromEarlierDay
    ? formatDateTime(item.atMillis, use24Hour)
    : formatTimeOfDay(item.atMillis, use24Hour);
  return nagging ? `since ${when}` : when;
}
