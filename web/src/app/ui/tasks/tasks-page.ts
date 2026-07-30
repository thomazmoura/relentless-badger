import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router } from '@angular/router';
import { AppState } from '../../core/app-state';
import { prefers24Hour } from '../../core/domain/format';
import { OpenTask } from '../../core/domain/models';
import { DateTimePickerDialog } from '../dialogs/date-time-picker-dialog';
import { EditScheduleDialog, EditScheduleResult } from '../dialogs/edit-schedule-dialog';
import { WaitOptionsDialog, WaitOptionsResult } from '../dialogs/wait-options-dialog';
import { QuickAdd } from './quick-add';
import { TaskRow } from './task-row';

/**
 * The list of open tasks, split into the ones already nagging and the ones
 * still waiting to start. The split keys off the start time rather than the
 * live nag time, so snoozing a task doesn't make it jump sections.
 */
@Component({
  selector: 'app-tasks-page',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatDividerModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatToolbarModule,
    QuickAdd,
    TaskRow,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar>
      <span class="title">RelentlessBadger</span>
      <button
        matIconButton
        aria-label="Sync"
        [disabled]="state.syncing()"
        (click)="state.refresh(true)"
      >
        @if (state.syncing()) {
          <mat-spinner diameter="20" />
        } @else {
          <mat-icon>refresh</mat-icon>
        }
      </button>
      <button matIconButton aria-label="Settings" (click)="router.navigate(['/settings'])">
        <mat-icon>settings</mat-icon>
      </button>
    </mat-toolbar>

    <div class="body">
      <div class="page-body">
        <app-quick-add />

        @if (state.notificationPermission() !== 'granted') {
          <mat-card appearance="outlined" class="banner">
            <mat-card-content>
              <p>
                {{
                  state.notificationPermission() === 'denied'
                    ? 'Notifications are blocked, so this badger can only nag you while the app is open.'
                    : 'Allow notifications and install the app to get nagged even when this tab is in the background.'
                }}
              </p>
              @if (state.notificationPermission() === 'default') {
                <button matButton (click)="state.requestNotificationPermission()">
                  Allow notifications
                </button>
              }
            </mat-card-content>
          </mat-card>
        }

        @if (state.openTasks().length === 0) {
          <div class="empty">
            <p class="headline">Nothing pending 🎉</p>
            <p>Add something above and the badger starts crowing.</p>
          </div>
        } @else {
          @for (task of active(); track task.id) {
            <app-task-row
              [task]="task"
              [nowMillis]="state.nowMillis()"
              [use24Hour]="use24Hour"
              [waitMinutes]="state.session().waitMinutes"
              (edit)="editSchedule(task)"
              (done)="state.completeTask(task.id)"
              (cancelTask)="state.cancelTask(task.id)"
              (snooze)="state.snoozeTask(task.id, $event)"
              (pickExactWait)="pickExactWait(task)"
            />
            <mat-divider />
          }
          @if (scheduled().length > 0) {
            <p class="section">Scheduled</p>
            @for (task of scheduled(); track task.id) {
              <app-task-row
                [task]="task"
                [nowMillis]="state.nowMillis()"
                [use24Hour]="use24Hour"
                [waitMinutes]="state.session().waitMinutes"
                (edit)="editSchedule(task)"
                (done)="state.completeTask(task.id)"
                (cancelTask)="state.cancelTask(task.id)"
              />
              <mat-divider />
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
    .title {
      flex: 1;
    }
    .body {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
    }
    .banner {
      margin: 1rem 0;
    }
    .banner p {
      margin: 0 0 0.5rem;
    }
    .empty {
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
      margin-top: 3rem;
    }
    .empty .headline {
      font: var(--mat-sys-title-medium);
      color: var(--mat-sys-on-surface);
    }
    .section {
      font: var(--mat-sys-title-small);
      color: var(--mat-sys-on-surface-variant);
      margin: 1.5rem 0 0.25rem;
    }
  `,
})
export class TasksPage {
  readonly state = inject(AppState);
  readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly use24Hour = prefers24Hour();

  private readonly partitioned = computed(() => {
    const now = this.state.nowMillis();
    const scheduled: OpenTask[] = [];
    const active: OpenTask[] = [];
    for (const task of this.state.openTasks()) {
      ((task.firstWarningAtMillis ?? 0) > now ? scheduled : active).push(task);
    }
    return { scheduled, active };
  });
  readonly scheduled = computed(() => this.partitioned().scheduled);
  readonly active = computed(() => this.partitioned().active);

  constructor() {
    effect(() => {
      const message = this.state.errorMessage();
      if (message) {
        this.snackBar.open(message, undefined, { duration: 4000 });
        this.state.errorMessage.set(null);
      }
    });

    effect(() => {
      const dismissed = this.state.dismissedSuggestion();
      if (!dismissed) return;
      this.state.dismissedSuggestion.set(null);
      this.snackBar
        .open(`Removed "${dismissed}" from suggestions`, 'Undo', { duration: 6000 })
        .onAction()
        .subscribe(() => void this.state.undoDismissSuggestion(dismissed));
    });

    // A reminder tapped on its body asks for the wait picker.
    effect(() => {
      const task = this.state.waitPickerTask();
      if (task) void this.openWaitOptions(task);
    });
  }

  async editSchedule(task: OpenTask): Promise<void> {
    const result = (await this.dialog
      .open(EditScheduleDialog, { data: task })
      .afterClosed()
      .toPromise()) as EditScheduleResult | undefined;
    if (!result) return;
    await this.state.saveSchedule(
      task.id,
      result.firstWarningAtMillis,
      result.repeatIntervalMinutes,
      result.recurrence,
    );
  }

  async pickExactWait(task: OpenTask): Promise<void> {
    const picked = await this.dialog
      .open(DateTimePickerDialog, { data: { title: task.title, initialMillis: null } })
      .afterClosed()
      .toPromise();
    if (typeof picked === 'number') await this.state.snoozeUntil(task.id, picked);
  }

  private async openWaitOptions(task: OpenTask): Promise<void> {
    this.state.waitPickerTask.set(null);
    const result = (await this.dialog
      .open(WaitOptionsDialog, {
        data: { title: task.title, waitMinutes: this.state.session().waitMinutes },
      })
      .afterClosed()
      .toPromise()) as WaitOptionsResult | undefined;
    if (typeof result === 'number') {
      await this.state.snoozeTask(task.id, result);
    } else if (result === 'pick') {
      await this.pickExactWait(task);
    }
  }
}
