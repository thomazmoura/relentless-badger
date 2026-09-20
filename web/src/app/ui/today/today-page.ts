import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AppState } from '../../core/app-state';
import { buildDailyOverview, DailyOverviewItem } from '../../core/domain/daily-overview';
import { prefers24Hour } from '../../core/domain/format';
import { overviewTimeLabel, renderDailyOverview } from './today-export';

/**
 * The day at a glance: what is nagging right now, and what is still expected
 * before the day is out. Read-only on purpose — acting on a task is the Tasks
 * tab's job; this one is for looking, and for sending the list somewhere else.
 */
@Component({
  selector: 'app-today-page',
  imports: [MatButtonModule, MatIconModule, MatToolbarModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar>
      <span>Today</span>
      <span class="spacer"></span>
      <button matIconButton aria-label="Share today" (click)="share()">
        <mat-icon>share</mat-icon>
      </button>
      <button matIconButton aria-label="Copy today" (click)="copy()">
        <mat-icon>content_copy</mat-icon>
      </button>
    </mat-toolbar>

    <div class="body">
      <div class="page-body">
        @if (empty()) {
          <p class="empty">Nothing scheduled for today.</p>
        } @else {
          @if (overview().now.length > 0) {
            <h2 class="section">Now</h2>
            @for (item of overview().now; track item.taskId) {
              <div class="entry">
                <mat-icon class="kind nagging" aria-label="Nagging">notifications_active</mat-icon>
                <div class="text">
                  <span class="title">{{ item.title }}</span>
                  <span class="when">{{ label(item, true) }}</span>
                </div>
                @if (item.recurring) {
                  <mat-icon class="repeat" aria-label="Repeats">repeat</mat-icon>
                }
              </div>
            }
          }

          @if (overview().later.length > 0) {
            <h2 class="section">Later today</h2>
            @for (item of overview().later; track item.taskId) {
              <div class="entry">
                <mat-icon class="kind" aria-label="Scheduled">schedule</mat-icon>
                <div class="text">
                  <span class="title">{{ item.title }}</span>
                  <span class="when">{{ label(item, false) }}</span>
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
export class TodayPage {
  protected readonly state = inject(AppState);
  private readonly snackBar = inject(MatSnackBar);
  private readonly use24Hour = prefers24Hour();

  // nowMillis ticks every 15s, so a task crossing its start time moves from
  // "Later today" up into "Now" on its own, without a data change.
  protected readonly overview = computed(() =>
    buildDailyOverview(this.state.openTasks(), this.state.nowMillis()),
  );

  protected readonly empty = computed(
    () => this.overview().now.length === 0 && this.overview().later.length === 0,
  );

  protected label(item: DailyOverviewItem, nagging: boolean): string {
    return overviewTimeLabel(item, nagging, this.use24Hour);
  }

  protected async share(): Promise<void> {
    const text = renderDailyOverview(this.overview(), this.use24Hour, 'markdown');
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
        this.snackBar.open('Could not share today’s list', undefined, { duration: 4000 });
      }
    }
  }

  protected async copy(): Promise<void> {
    const text = renderDailyOverview(this.overview(), this.use24Hour, 'plain');
    await this.writeClipboard(text, 'Copied today’s list');
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
