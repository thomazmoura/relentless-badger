import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AppState } from '../../core/app-state';
import {
  buildDailyOverview,
  DailyOverviewItem,
  isOverviewEmpty,
  OverviewSectionKind,
} from '../../core/domain/daily-overview';
import { formatDayTitle, prefers24Hour } from '../../core/domain/format';
import { LocalDate } from '../../core/domain/time';
import { overviewTimeLabel, renderDailyOverview, sectionLabel } from './today-export';

/**
 * A day at a glance: on today, what is nagging right now and what is still
 * expected before the day is out; on any other day, what it left behind or what
 * it will bring. Read-only on purpose — acting on a task is the Tasks tab's job;
 * this one is for looking, and for sending the list somewhere else.
 *
 * `date` null means today, followed live: the state's ticking clock moves a
 * task up on its own and rolls the digest over at midnight. A given date is
 * fixed, and gets a back button to leave by.
 */
@Component({
  selector: 'app-overview-view',
  imports: [MatButtonModule, MatChipsModule, MatIconModule, MatToolbarModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar>
      @if (back()) {
        <button matIconButton aria-label="Back" (click)="back()!()">
          <mat-icon>arrow_back</mat-icon>
        </button>
      }
      <span>{{ title() }}</span>
      <span class="spacer"></span>
      <button matIconButton [attr.aria-label]="'Share ' + title()" (click)="share()">
        <mat-icon>share</mat-icon>
      </button>
      <button matIconButton [attr.aria-label]="'Copy ' + title()" (click)="copy()">
        <mat-icon>content_copy</mat-icon>
      </button>
    </mat-toolbar>

    <div class="body">
      <div class="page-body">
        <mat-chip-listbox hideSingleSelectionIndicator>
          <mat-chip-option
            [selected]="includeConcluded()"
            (selectionChange)="includeConcluded.set($any($event).selected)"
          >
            Show completed
          </mat-chip-option>
        </mat-chip-listbox>

        @if (empty()) {
          <p class="empty">Nothing on this day.</p>
        } @else {
          @for (section of overview().sections; track section.kind) {
            <h2 class="section">{{ label(section.kind) }}</h2>
            @for (item of section.items; track item.taskId) {
              <div class="entry">
                <mat-icon
                  class="kind"
                  [class.nagging]="nagging(section.kind)"
                  [attr.aria-label]="label(section.kind)"
                >
                  {{ icon(section.kind) }}
                </mat-icon>
                <div class="text">
                  <span class="title">{{ item.title }}</span>
                  <span class="when">{{ timeLabel(item, section.kind) }}</span>
                </div>
                @if (item.recurring) {
                  <mat-icon class="repeat" aria-label="Repeats">repeat</mat-icon>
                }
              </div>
            }
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
    .spacer {
      flex: 1;
    }
    .body {
      flex: 1;
      overflow-y: auto;
      padding: 0.5rem 1rem 1rem;
    }
    .empty {
      color: var(--mat-sys-on-surface-variant);
    }
    .section {
      font: var(--mat-sys-title-small);
      color: var(--mat-sys-primary);
      margin: 1rem 0 0.25rem;
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
    .entry .kind.nagging {
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
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .entry .when {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .entry .repeat {
      color: var(--mat-sys-on-surface-variant);
      font-size: 1rem;
      width: 1rem;
      height: 1rem;
    }
  `,
})
export class OverviewView {
  /** The day to show; null follows the clock, as the Today tab does. */
  readonly date = input<LocalDate | null>(null);
  /** Present only when there is somewhere to go back to. */
  readonly back = input<(() => void) | null>(null);
  readonly includeConcluded = model(false);

  protected readonly state = inject(AppState);
  private readonly snackBar = inject(MatSnackBar);
  private readonly use24Hour = prefers24Hour();

  protected readonly title = computed(() => {
    const date = this.date();
    return date === null ? 'Today' : formatDayTitle(date);
  });

  protected readonly overview = computed(() =>
    buildDailyOverview(
      this.state.openTasks(),
      this.state.completedOnOverviewDay(),
      this.date() ?? this.state.today(),
      this.state.nowMillis(),
      this.includeConcluded(),
      this.state.zone,
    ),
  );

  protected readonly empty = computed(() => isOverviewEmpty(this.overview()));

  protected label = sectionLabel;

  protected nagging(kind: OverviewSectionKind): boolean {
    return kind !== 'later' && kind !== 'scheduled';
  }

  protected icon(kind: OverviewSectionKind): string {
    if (kind === 'done') return 'check';
    return this.nagging(kind) ? 'notifications_active' : 'schedule';
  }

  protected timeLabel(item: DailyOverviewItem, kind: OverviewSectionKind): string {
    return overviewTimeLabel(item, kind, this.use24Hour);
  }

  protected async share(): Promise<void> {
    const text = renderDailyOverview(this.overview(), this.title(), this.use24Hour, 'markdown');
    // Desktop browsers mostly lack the share sheet. Falling back to the
    // clipboard keeps the button meaningful rather than hiding it on half the
    // platforms the PWA runs on.
    if (!('share' in navigator)) {
      await this.writeClipboard(text, 'Sharing is not available here — copied instead');
      return;
    }
    try {
      await navigator.share({ text });
    } catch (error) {
      // A cancelled share sheet is the user changing their mind, not a failure.
      if ((error as DOMException)?.name !== 'AbortError') {
        this.snackBar.open('Could not share the list', undefined, { duration: 4000 });
      }
    }
  }

  protected async copy(): Promise<void> {
    const text = renderDailyOverview(this.overview(), this.title(), this.use24Hour, 'plain');
    await this.writeClipboard(text, 'Copied the list');
  }

  private async writeClipboard(text: string, message: string): Promise<void> {
    try {
      // Absent outside a secure context, and it can still reject when the
      // document has lost focus.
      await navigator.clipboard.writeText(text);
      this.snackBar.open(message, undefined, { duration: 4000 });
    } catch {
      this.snackBar.open('Could not copy to the clipboard', undefined, { duration: 4000 });
    }
  }
}
