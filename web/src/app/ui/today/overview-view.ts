import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AppState } from '../../core/app-state';
import { I18n } from '../../core/i18n/i18n.service';

import {
  buildDailyOverview,
  DailyOverviewItem,
  isOverviewEmpty,
  OverviewSectionKind,
} from '../../core/domain/daily-overview';
import { formatDayTitle, prefers24Hour } from '../../core/domain/format';
import { LocalDate } from '../../core/domain/time';
import { ReportShare } from '../reports/report-share';
import { overviewTimeLabel, renderDailyOverview, sectionLabel } from './today-export';

/**
 * A day at a glance: on today, what is nagging right now and what is still
 * expected before the day is out; on any other day, what it left behind or what
 * it will bring. Read-only on purpose — acting on a task is the Tasks tab's job;
 * this one is for looking, and for sending the list somewhere else.
 *
 * `date` null means today, followed live: the state's ticking clock moves a
 * task up on its own and rolls the digest over at midnight. A given date is
 * fixed, and gets a back button to leave by. Projected content sits above the
 * list, where the Reports tab puts its report switch.
 */
@Component({
  selector: 'app-overview-view',
  imports: [MatButtonModule, MatChipsModule, MatIconModule, MatToolbarModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar>
      @if (back()) {
        <button matIconButton [attr.aria-label]="s().back" (click)="back()!()">
          <mat-icon>arrow_back</mat-icon>
        </button>
      }
      <span>{{ title() }}</span>
      <span class="spacer"></span>
      <button matIconButton [attr.aria-label]="s().share(title())" (click)="share()">
        <mat-icon>share</mat-icon>
      </button>
      <button matIconButton [attr.aria-label]="s().copy(title())" (click)="copy()">
        <mat-icon>content_copy</mat-icon>
      </button>
    </mat-toolbar>

    <div class="body">
      <div class="page-body">
        <ng-content />
        <mat-chip-listbox hideSingleSelectionIndicator>
          <mat-chip-option
            [selected]="includeConcluded()"
            (selectionChange)="includeConcluded.set($any($event).selected)"
          >
            {{ s().showCompleted }}
          </mat-chip-option>
        </mat-chip-listbox>

        @if (empty()) {
          <p class="empty">{{ s().nothingOnThisDay }}</p>
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
                  <mat-icon class="repeat" [attr.aria-label]="s().repeats">repeat</mat-icon>
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
  /** The day to show; null follows the clock, as the Today report does. */
  readonly date = input<LocalDate | null>(null);
  /** Present only when there is somewhere to go back to. */
  readonly back = input<(() => void) | null>(null);
  readonly includeConcluded = model(false);

  protected readonly state = inject(AppState);
  protected readonly s = inject(I18n).strings;
  private readonly reportShare = inject(ReportShare);
  private readonly use24Hour = prefers24Hour();

  protected readonly title = computed(() => {
    const date = this.date();
    return date === null ? this.s().reportToday : formatDayTitle(date, this.s());
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

  protected label(kind: OverviewSectionKind): string {
    return sectionLabel(kind, this.s());
  }

  protected nagging(kind: OverviewSectionKind): boolean {
    return kind !== 'later' && kind !== 'scheduled';
  }

  protected icon(kind: OverviewSectionKind): string {
    if (kind === 'done') return 'check';
    return this.nagging(kind) ? 'notifications_active' : 'schedule';
  }

  protected timeLabel(item: DailyOverviewItem, kind: OverviewSectionKind): string {
    return overviewTimeLabel(item, kind, this.use24Hour, this.s());
  }

  protected share(): Promise<void> {
    return this.reportShare.share(
      renderDailyOverview(this.overview(), this.title(), this.use24Hour, 'markdown', this.s()),
    );
  }

  protected copy(): Promise<void> {
    return this.reportShare.copy(
      renderDailyOverview(this.overview(), this.title(), this.use24Hour, 'plain', this.s()),
    );
  }
}
