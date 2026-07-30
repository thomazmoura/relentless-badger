import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AppState } from '../../core/app-state';
import { CalendarEntry } from '../../core/domain/calendar-entries';
import { formatDateTime, prefers24Hour, shortWeekdayNames } from '../../core/domain/format';
import {
  atDay,
  dateAt,
  dateKey,
  dayOfWeek,
  lengthOfMonth,
  LocalDate,
  plusMonths,
  sameDate,
} from '../../core/domain/time';

interface DayCell {
  readonly date: LocalDate | null;
  readonly key: string;
  readonly hasEntries: boolean;
  readonly today: boolean;
}

/**
 * The month at a glance: what got done, what got cancelled (opt-in), and what
 * is scheduled — including every future occurrence of a repeating task. The
 * grid is Monday-first, matching the recurrence bitmask.
 */
@Component({
  selector: 'app-calendar-page',
  imports: [MatButtonModule, MatChipsModule, MatDividerModule, MatIconModule, MatToolbarModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar><span>Calendar</span></mat-toolbar>

    <div class="body">
      <div class="page-body">
        <div class="month">
          <button matIconButton aria-label="Previous month" (click)="stepMonth(-1)">
            <mat-icon>chevron_left</mat-icon>
          </button>
          <span class="label">{{ monthLabel() }}</span>
          <button matIconButton aria-label="Next month" (click)="stepMonth(1)">
            <mat-icon>chevron_right</mat-icon>
          </button>
        </div>

        <div class="grid weekdays">
          @for (name of weekdayNames; track name) {
            <span class="weekday">{{ name }}</span>
          }
        </div>

        <div class="grid">
          @for (cell of cells(); track cell.key) {
            @if (cell.date) {
              <button
                type="button"
                class="cell"
                [class.selected]="isSelected(cell.date)"
                [class.today]="cell.today"
                (click)="state.selectedCalendarDate.set(cell.date)"
              >
                <span class="day">{{ cell.date.day }}</span>
                <span class="dot" [class.visible]="cell.hasEntries"></span>
              </button>
            } @else {
              <span class="cell"></span>
            }
          }
        </div>

        <mat-divider />

        <div class="selected-day">
          <span class="date">{{ selectedLabel() }}</span>
          <mat-chip-listbox hideSingleSelectionIndicator>
            <mat-chip-option
              [selected]="state.showCancelledInCalendar()"
              (selectionChange)="state.toggleShowCancelled($any($event).selected)"
            >
              Show cancelled
            </mat-chip-option>
          </mat-chip-listbox>
        </div>

        @if (state.selectedDayEntries().length === 0) {
          <p class="empty">Nothing on this day.</p>
        } @else {
          @for (entry of state.selectedDayEntries(); track entry.taskId + ':' + entry.atMillis) {
            <div class="entry">
              <mat-icon
                class="kind"
                [class.done]="entry.kind === 'completed'"
                [attr.aria-label]="kindLabel(entry)"
              >
                {{ kindIcon(entry) }}
              </mat-icon>
              <div class="text">
                <span class="title" [class.cancelled]="entry.kind === 'cancelled'">{{
                  entry.title
                }}</span>
                <span class="when"
                  >{{ prefix(entry) }} {{ formatDateTime(entry.atMillis, use24Hour) }}</span
                >
              </div>
              @if (entry.recurring) {
                <mat-icon class="repeat" aria-label="Repeats">repeat</mat-icon>
              }
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }
    .body {
      flex: 1;
      overflow-y: auto;
      padding: 0.5rem 1rem 1rem;
    }
    .month {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .month .label {
      font: var(--mat-sys-title-medium);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
    }
    .weekdays .weekday {
      text-align: center;
      font: var(--mat-sys-label-small);
      color: var(--mat-sys-on-surface-variant);
      padding-bottom: 0.25rem;
    }
    .cell {
      aspect-ratio: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      border: 1px solid transparent;
      border-radius: 50%;
      background: none;
      color: inherit;
      cursor: pointer;
      font: var(--mat-sys-body-medium);
      margin: 2px;
    }
    .cell.today {
      border-color: var(--mat-sys-primary);
      color: var(--mat-sys-primary);
      font-weight: 700;
    }
    .cell.selected {
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }
    .dot {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: transparent;
    }
    .dot.visible {
      background: currentColor;
    }
    .selected-day {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-top: 0.5rem;
    }
    .selected-day .date {
      font: var(--mat-sys-title-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .empty {
      color: var(--mat-sys-on-surface-variant);
    }
    .entry {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem 0;
    }
    .entry .kind {
      color: var(--mat-sys-on-surface-variant);
    }
    .entry .kind.done {
      color: var(--mat-sys-primary);
    }
    .entry .text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .entry .title {
      font: var(--mat-sys-body-large);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .entry .title.cancelled {
      text-decoration: line-through;
    }
    .entry .when {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .entry .repeat {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class CalendarPage {
  readonly state = inject(AppState);
  readonly weekdayNames = shortWeekdayNames('narrow');
  readonly use24Hour = prefers24Hour();
  readonly formatDateTime = formatDateTime;

  readonly monthLabel = computed(() => {
    const month = this.state.calendarMonth();
    return new Intl.DateTimeFormat(undefined, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(Date.UTC(month.year, month.month - 1, 1));
  });

  readonly selectedLabel = computed(() => {
    const date = this.state.selectedCalendarDate();
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(Date.UTC(date.year, date.month - 1, date.day));
  });

  readonly cells = computed<DayCell[]>(() => {
    const month = this.state.calendarMonth();
    const entries = this.state.calendarEntries();
    const today = dateAt(Date.now(), this.state.zone);
    const leadingBlanks = dayOfWeek(atDay(month, 1));
    const cells: DayCell[] = [];
    for (let i = 0; i < leadingBlanks; i++) {
      cells.push({ date: null, key: `blank-${i}`, hasEntries: false, today: false });
    }
    for (let day = 1; day <= lengthOfMonth(month); day++) {
      const date = atDay(month, day);
      const key = dateKey(date);
      cells.push({
        date,
        key,
        hasEntries: (entries.get(key)?.length ?? 0) > 0,
        today: sameDate(date, today),
      });
    }
    return cells;
  });

  stepMonth(delta: number): void {
    this.state.showCalendarMonth(plusMonths(this.state.calendarMonth(), delta));
  }

  isSelected(date: LocalDate): boolean {
    return sameDate(date, this.state.selectedCalendarDate());
  }

  kindIcon(entry: CalendarEntry): string {
    return entry.kind === 'completed' ? 'check' : entry.kind === 'cancelled' ? 'close' : 'schedule';
  }

  kindLabel(entry: CalendarEntry): string {
    return entry.kind === 'completed'
      ? 'Completed'
      : entry.kind === 'cancelled'
        ? 'Cancelled'
        : 'Scheduled';
  }

  prefix(entry: CalendarEntry): string {
    return entry.kind === 'completed'
      ? 'done'
      : entry.kind === 'cancelled'
        ? 'cancelled'
        : 'starts';
  }
}
