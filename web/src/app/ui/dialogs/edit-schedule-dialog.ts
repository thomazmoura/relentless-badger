import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { formatDateTime, prefers24Hour, recurrenceLabel } from '../../core/domain/format';
import { OpenTask, Recurrence, taskRecurrence } from '../../core/domain/models';
import { DateTimePickerDialog } from './date-time-picker-dialog';
import { RecurrencePickerDialog } from './recurrence-picker-dialog';

export interface EditScheduleResult {
  readonly firstWarningAtMillis: number | null;
  readonly repeatIntervalMinutes: number;
  readonly recurrence: Recurrence | null;
}

/** Rewrites when a task starts nagging, how often it re-nags, and whether it repeats. */
@Component({
  selector: 'app-edit-schedule-dialog',
  imports: [
    FormsModule,
    MatButtonModule,
    MatChipsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="title">{{ task.title }}</h2>
    <mat-dialog-content class="content">
      <mat-chip-set>
        <mat-chip (click)="pickStart()">
          <mat-icon matChipAvatar>schedule</mat-icon>
          {{
            startMillis() === null
              ? 'Set start time'
              : 'Starts ' + formatDateTime(startMillis()!, use24Hour)
          }}
          @if (startMillis() !== null) {
            <button matChipRemove aria-label="Clear start time" (click)="clearStart($event)">
              <mat-icon>cancel</mat-icon>
            </button>
          }
        </mat-chip>
        <mat-chip (click)="pickRecurrence()">
          <mat-icon matChipAvatar>repeat</mat-icon>
          {{ recurrence() === null ? 'Does not repeat' : recurrenceLabel(recurrence()!) }}
          @if (recurrence() !== null) {
            <button matChipRemove aria-label="Clear recurrence" (click)="clearRecurrence($event)">
              <mat-icon>cancel</mat-icon>
            </button>
          }
        </mat-chip>
      </mat-chip-set>

      <mat-form-field appearance="outline" class="interval">
        <mat-label>Nag every N minutes</mat-label>
        <input
          matInput
          type="number"
          min="1"
          [ngModel]="intervalText()"
          (ngModelChange)="intervalText.set($event)"
        />
        @if (!intervalValid()) {
          <mat-error>At least 1 minute.</mat-error>
        }
      </mat-form-field>

      @if (recurrence() !== null && startMillis() === null) {
        <p class="error">A repeating task needs a start time.</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Cancel</button>
      <button matButton="filled" [disabled]="!canSave()" (click)="save()">Save</button>
    </mat-dialog-actions>
  `,
  styles: `
    .title {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .content {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      min-width: 17rem;
    }
    .interval {
      width: 14rem;
    }
    .error {
      color: var(--mat-sys-error);
      margin: 0;
      font: var(--mat-sys-body-small);
    }
  `,
})
export class EditScheduleDialog {
  readonly task = inject<OpenTask>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<EditScheduleDialog, EditScheduleResult>);
  private readonly dialog = inject(MatDialog);

  readonly use24Hour = prefers24Hour();
  readonly formatDateTime = formatDateTime;
  readonly recurrenceLabel = recurrenceLabel;

  readonly startMillis = signal<number | null>(this.task.firstWarningAtMillis);
  readonly recurrence = signal<Recurrence | null>(taskRecurrence(this.task));
  readonly intervalText = signal(String(this.task.repeatIntervalMinutes));

  private readonly interval = computed(() => {
    const text = this.intervalText().trim();
    return /^\d+$/.test(text) ? Number(text) : null;
  });
  readonly intervalValid = computed(() => (this.interval() ?? 0) >= 1);
  readonly canSave = computed(
    () => this.intervalValid() && (this.recurrence() === null || this.startMillis() !== null),
  );

  async pickStart(): Promise<void> {
    const picked = await this.dialog
      .open(DateTimePickerDialog, {
        data: { title: 'Start time', initialMillis: this.startMillis() },
      })
      .afterClosed()
      .toPromise();
    if (typeof picked === 'number') this.startMillis.set(picked);
  }

  clearStart(event: Event): void {
    event.stopPropagation();
    this.startMillis.set(null);
    // A repeating task without a start has nothing to anchor to, so clearing
    // the start clears the rule too.
    this.recurrence.set(null);
  }

  async pickRecurrence(): Promise<void> {
    const picked = await this.dialog
      .open(RecurrencePickerDialog, { data: { initial: this.recurrence() } })
      .afterClosed()
      .toPromise();
    if (picked !== undefined) this.recurrence.set(picked);
  }

  clearRecurrence(event: Event): void {
    event.stopPropagation();
    this.recurrence.set(null);
  }

  save(): void {
    if (!this.canSave()) return;
    this.dialogRef.close({
      firstWarningAtMillis: this.startMillis(),
      repeatIntervalMinutes: this.interval()!,
      recurrence: this.recurrence(),
    });
  }
}
