import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import {
  formatDateTime,
  formatDuration,
  recurrenceLabel,
  relativeFuture,
} from '../../core/domain/format';
import { OpenTask, taskRecurrence } from '../../core/domain/models';

/**
 * One task. The whole row opens the schedule editor; the snooze menu is
 * anchored to its button; Done completes on click and offers "Cancel task" on
 * long-press or right-click, the way the Android circle does.
 */
@Component({
  selector: 'app-task-row',
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row" (click)="edit.emit()">
      <div class="text">
        <span class="title">{{ task().title }}</span>
        <span class="subtitle">{{ subtitle() }}</span>
        @if (recurrence(); as rule) {
          <span class="recurrence">{{ recurrenceLabel(rule) }}</span>
        }
      </div>

      @if (!scheduled()) {
        <button
          matIconButton
          aria-label="Snooze"
          [matMenuTriggerFor]="snoozeMenu"
          (click)="$event.stopPropagation()"
        >
          <mat-icon>snooze</mat-icon>
        </button>
        <mat-menu #snoozeMenu>
          @for (minutes of waitMinutes(); track minutes) {
            <button mat-menu-item (click)="snooze.emit(minutes)">
              <mat-icon>snooze</mat-icon>
              <span>Wait {{ formatDuration(minutes) }}</span>
            </button>
          }
          <button mat-menu-item (click)="pickExactWait.emit()">
            <mat-icon>schedule</mat-icon>
            <span>Pick a date &amp; time…</span>
          </button>
        </mat-menu>
      }

      <button
        class="done"
        type="button"
        aria-label="Mark done"
        [matMenuTriggerFor]="closeMenu"
        #closeTrigger="matMenuTrigger"
        (click)="onDoneClick($event)"
        (contextmenu)="openCloseMenu($event, closeTrigger)"
        (pointerdown)="startLongPress($event, closeTrigger)"
        (pointerup)="cancelLongPress()"
        (pointerleave)="cancelLongPress()"
      >
        <mat-icon>check</mat-icon>
      </button>
      <mat-menu #closeMenu>
        <button mat-menu-item (click)="cancelTask.emit()">
          <mat-icon>close</mat-icon>
          <span>Cancel task</span>
        </button>
      </mat-menu>
    </div>
  `,
  styles: `
    .row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0;
      cursor: pointer;
    }
    .text {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }
    .title {
      font: var(--mat-sys-body-large);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .subtitle {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .recurrence {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-primary);
    }
    .done {
      flex: none;
      width: 40px;
      height: 40px;
      border: none;
      border-radius: 50%;
      display: grid;
      place-items: center;
      cursor: pointer;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
      -webkit-touch-callout: none;
      user-select: none;
    }
  `,
})
export class TaskRow {
  readonly task = input.required<OpenTask>();
  readonly nowMillis = input.required<number>();
  readonly use24Hour = input(false);
  readonly waitMinutes = input.required<readonly number[]>();

  readonly edit = output<void>();
  readonly done = output<void>();
  readonly cancelTask = output<void>();
  readonly snooze = output<number>();
  readonly pickExactWait = output<void>();

  readonly formatDuration = formatDuration;
  readonly recurrenceLabel = recurrenceLabel;
  readonly recurrence = computed(() => taskRecurrence(this.task()));

  /** Not started nagging yet: snoozing it would mean nothing. */
  readonly scheduled = computed(() => (this.task().firstWarningAtMillis ?? 0) > this.nowMillis());

  readonly subtitle = computed(() => {
    const task = this.task();
    if (this.scheduled()) {
      return `starts ${formatDateTime(task.firstWarningAtMillis ?? task.nextFireAtMillis, this.use24Hour())}`;
    }
    return `next nag ${relativeFuture(task.nextFireAtMillis, this.nowMillis())} · every ${task.repeatIntervalMinutes} min`;
  });

  private longPressHandle: ReturnType<typeof setTimeout> | null = null;
  private longPressed = false;

  onDoneClick(event: Event): void {
    event.stopPropagation();
    // The click that ends a long press must not also complete the task.
    if (this.longPressed) {
      this.longPressed = false;
      return;
    }
    this.done.emit();
  }

  startLongPress(event: PointerEvent, trigger: { openMenu(): void }): void {
    event.stopPropagation();
    this.longPressed = false;
    this.longPressHandle = setTimeout(() => {
      this.longPressed = true;
      trigger.openMenu();
    }, 500);
  }

  cancelLongPress(): void {
    if (this.longPressHandle !== null) {
      clearTimeout(this.longPressHandle);
      this.longPressHandle = null;
    }
  }

  openCloseMenu(event: Event, trigger: { openMenu(): void }): void {
    event.preventDefault();
    event.stopPropagation();
    this.longPressed = true;
    trigger.openMenu();
  }
}
