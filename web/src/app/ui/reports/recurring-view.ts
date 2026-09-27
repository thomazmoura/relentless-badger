import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AppState } from '../../core/app-state';
import { prefers24Hour } from '../../core/domain/format';
import { buildRecurringReport, RecurringReportItem } from '../../core/domain/recurring-report';
import { recurringNextLabel, recurringScheduleLabel, renderRecurringReport } from './recurring-export';
import { ReportShare } from './report-share';

/**
 * Every recurring series at a glance: how often it repeats, the hour it fires
 * at and when it fires next. Read-only, like the Today report, and shareable
 * the same way. Projected content sits above the list, where the Reports tab
 * puts its report switch.
 */
@Component({
  selector: 'app-recurring-view',
  imports: [MatButtonModule, MatIconModule, MatToolbarModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar>
      <span>{{ title }}</span>
      <span class="spacer"></span>
      <button matIconButton [attr.aria-label]="'Share ' + title" (click)="share()">
        <mat-icon>share</mat-icon>
      </button>
      <button matIconButton [attr.aria-label]="'Copy ' + title" (click)="copy()">
        <mat-icon>content_copy</mat-icon>
      </button>
    </mat-toolbar>

    <div class="body">
      <div class="page-body">
        <ng-content />

        @if (report().length === 0) {
          <p class="empty">No recurring tasks.</p>
        } @else {
          @for (item of report(); track item.taskId) {
            <div class="entry">
              <mat-icon
                class="kind"
                [class.nagging]="item.nagging"
                [attr.aria-label]="item.nagging ? 'Nagging' : 'Repeats'"
              >
                {{ item.nagging ? 'notifications_active' : 'repeat' }}
              </mat-icon>
              <div class="text">
                <span class="title">{{ item.title }}</span>
                <span class="when">{{ scheduleLabel(item) }}</span>
                <span class="when" [class.nagging]="item.nagging">{{ nextLabel(item) }}</span>
              </div>
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
    .entry {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem 0;
    }
    .entry .kind {
      color: var(--mat-sys-on-surface-variant);
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
    .entry .nagging {
      color: var(--mat-sys-primary);
    }
  `,
})
export class RecurringView {
  protected readonly title = 'Recurring';

  private readonly state = inject(AppState);
  private readonly reportShare = inject(ReportShare);
  private readonly use24Hour = prefers24Hour();

  // Follows the ticking clock so an occurrence reaching its start time turns
  // into "nagging" on its own.
  protected readonly report = computed(() =>
    buildRecurringReport(this.state.openTasks(), this.state.nowMillis()),
  );

  protected scheduleLabel(item: RecurringReportItem): string {
    return recurringScheduleLabel(item, this.use24Hour);
  }

  protected nextLabel(item: RecurringReportItem): string {
    return recurringNextLabel(item, this.use24Hour);
  }

  protected share(): Promise<void> {
    return this.reportShare.share(
      renderRecurringReport(this.report(), this.title, this.use24Hour, 'markdown'),
    );
  }

  protected copy(): Promise<void> {
    return this.reportShare.copy(
      renderRecurringReport(this.report(), this.title, this.use24Hour, 'plain'),
    );
  }
}
