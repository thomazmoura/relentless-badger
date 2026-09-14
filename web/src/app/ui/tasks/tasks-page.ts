import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
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
import {
  ROW_MOVE_ANIMATION_MILLIS,
  RowMovementGuard,
  SCHEDULED_HEADER_KEY,
  rowKeys,
} from './row-movement-guard';
import { TaskRow } from './task-row';

/** The event types that start or complete an action on a row. */
const ROW_TAP_EVENTS = ['click', 'contextmenu', 'pointerdown'] as const;

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

    <div class="body" #body>
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
          <div class="task-list">
            @for (task of active(); track task.id) {
              <div [attr.data-row-key]="task.id">
                <app-task-row
                  [task]="task"
                  [nowMillis]="state.nowMillis()"
                  [use24Hour]="use24Hour"
                  [waitMinutes]="state.session().waitMinutes"
                  [tapsLocked]="tapsLocked()"
                  (edit)="editSchedule(task)"
                  (done)="state.completeTask(task.id)"
                  (donePreviously)="donePreviously(task)"
                  (cancelTask)="state.cancelTask(task.id)"
                  (snooze)="state.snoozeTask(task.id, $event)"
                  (pickExactWait)="pickExactWait(task)"
                />
                <mat-divider />
              </div>
            }
            @if (scheduled().length > 0) {
              <p class="section" [attr.data-row-key]="scheduledHeaderKey">Scheduled</p>
              @for (task of scheduled(); track task.id) {
                <div [attr.data-row-key]="task.id">
                  <app-task-row
                    [task]="task"
                    [nowMillis]="state.nowMillis()"
                    [use24Hour]="use24Hour"
                    [waitMinutes]="state.session().waitMinutes"
                    [tapsLocked]="tapsLocked()"
                    (edit)="editSchedule(task)"
                    (done)="state.completeTask(task.id)"
                    (donePreviously)="donePreviously(task)"
                    (cancelTask)="state.cancelTask(task.id)"
                    (advance)="state.advanceTask(task.id)"
                  />
                  <mat-divider />
                </div>
              }
            }
          </div>
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
      // Rows reorder as nag times change; letting the browser hold its anchor
      // steady means chasing the row that moved instead of the list.
      overflow-anchor: none;
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
    // The offsets the slide animation compares are measured against this box,
    // so banners above the list coming and going don't read as rows moving.
    .task-list {
      position: relative;
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
  private readonly destroyRef = inject(DestroyRef);

  readonly use24Hour = prefers24Hour();
  readonly scheduledHeaderKey = SCHEDULED_HEADER_KEY;

  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');

  private readonly movementGuard = new RowMovementGuard();
  /**
   * Mirrors the guard's lock for drawing. The taps themselves still ask the
   * guard, since this only catches up a render after the rows move.
   */
  readonly tapsLocked = signal(false);
  private tapLockRelease: ReturnType<typeof setTimeout> | null = null;
  /** Each row's offset in the list as of the last render, by row key. */
  private rowOffsets = new Map<string, number>();

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

    // Acting on a task usually moves it down the list, and the tasks that end up
    // on top are the ones firing soonest — exactly what the user needs to see to
    // decide whether they want to wait on those too.
    effect(() => {
      if (this.state.taskListResetToken() === 0) return;
      // Instant, not smooth: the list re-renders in the same frame and a queued
      // smooth animation gets dropped.
      this.body().nativeElement.scrollTop = 0;
    });

    // A reminder tapped on its body asks for the wait picker.
    effect(() => {
      const task = this.state.waitPickerTask();
      if (task) void this.openWaitOptions(task);
    });

    // Runs after every render that touched the rows, including the countdown
    // tick, so the stored offsets never go stale when a row's height changes.
    afterRenderEffect(() => {
      const keys = rowKeys(
        this.active().map((task) => task.id),
        this.scheduled().map((task) => task.id),
      );
      const changed = this.movementGuard.observe(keys);
      this.measureRows(changed);
      if (changed && !this.movementGuard.allowsTap()) this.holdTapLock();
    });
    this.destroyRef.onDestroy(() => {
      if (this.tapLockRelease !== null) clearTimeout(this.tapLockRelease);
    });

    // Swallows taps on a row while the rows are still moving: the task under
    // the finger may not be the one the user aimed at. Capture phase, because
    // the menu triggers act from their own host listeners before any handler of
    // ours could. The menus themselves render in the overlay container, outside
    // this element, so an already-open menu — which belongs to its task — keeps
    // working. Scrolling isn't a tap and stays live.
    afterNextRender(() => {
      const body = this.body().nativeElement;
      const swallow = (event: Event) => {
        if (this.movementGuard.allowsTap()) return;
        if (!(event.target instanceof Element) || !event.target.closest('app-task-row')) return;
        event.stopPropagation();
        event.preventDefault();
      };
      for (const type of ROW_TAP_EVENTS) body.addEventListener(type, swallow, { capture: true });
      this.destroyRef.onDestroy(() => {
        for (const type of ROW_TAP_EVENTS) body.removeEventListener(type, swallow, { capture: true });
      });
    });
  }

  /**
   * Keeps the locked look on until the guard lets taps through again. Re-asks
   * the guard after each wait, because a further move while locked pushes the
   * end back.
   */
  private holdTapLock(): void {
    if (this.tapLockRelease !== null) clearTimeout(this.tapLockRelease);
    this.tapLockRelease = null;
    const remaining = this.movementGuard.tapLockRemainingMillis();
    this.tapsLocked.set(remaining > 0);
    if (remaining > 0) this.tapLockRelease = setTimeout(() => this.holdTapLock(), remaining);
  }

  /**
   * Records where each row sits and, when the order changed, slides every row
   * that moved from its old slot to its new one so the eye can follow it. New rows
   * fade in; removed rows don't linger, so their neighbours visibly close the gap.
   * Rows are re-rendered in place (`track task.id`), so the elements are the same
   * ones that were measured before.
   */
  private measureRows(orderChanged: boolean): void {
    const rows = this.body().nativeElement.querySelectorAll<HTMLElement>('[data-row-key]');
    const previous = this.rowOffsets;
    this.rowOffsets = new Map(Array.from(rows, (row) => [row.dataset['rowKey']!, row.offsetTop]));
    // Nothing to animate from on the first list shown, just like a fresh Compose list.
    if (!orderChanged || previous.size === 0) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timing = { duration: ROW_MOVE_ANIMATION_MILLIS, easing: 'cubic-bezier(0.2, 0, 0, 1)' };
    for (const row of rows) {
      const key = row.dataset['rowKey']!;
      const was = previous.get(key);
      if (was === undefined) {
        row.animate([{ opacity: 0 }, { opacity: 1 }], timing);
        continue;
      }
      const shift = was - this.rowOffsets.get(key)!;
      if (shift === 0) continue;
      // A row caught mid-slide restarts from its last settled slot rather than
      // stacking two slides.
      for (const running of row.getAnimations()) running.cancel();
      row.animate([{ transform: `translateY(${shift}px)` }, { transform: 'none' }], timing);
    }
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

  /**
   * Closes a task the user actually finished earlier. The window is the task's own
   * lifetime: it can't have been done before it was created, nor later than now.
   */
  async donePreviously(task: OpenTask): Promise<void> {
    const now = this.state.nowMillis();
    const picked = await this.dialog
      .open(DateTimePickerDialog, {
        data: {
          title: task.title,
          initialMillis: now,
          minMillis: task.createdAtMillis,
          maxMillis: now,
        },
      })
      .afterClosed()
      .toPromise();
    if (typeof picked === 'number') await this.state.completeTask(task.id, picked);
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
