import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { defaultWeekdayBit, shortWeekdayNames } from '../../core/domain/format';
import { Recurrence, RecurUnit } from '../../core/domain/models';

export interface RecurrencePickerData {
  readonly initial: Recurrence | null;
}

/**
 * "Repeat": none, daily or weekly. The weekday chips are Monday-first, matching
 * the bitmask the rule is stored in (bit 0 = Monday .. bit 6 = Sunday).
 *
 * Closing with `null` clears the recurrence; dismissing returns undefined and
 * leaves it alone.
 */
@Component({
  selector: 'app-recurrence-picker-dialog',
  imports: [
    FormsModule,
    MatButtonModule,
    MatChipsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Repeat</h2>
    <mat-dialog-content>
      <mat-chip-listbox
        [value]="unit()"
        (change)="pickUnit($any($event).value)"
        hideSingleSelectionIndicator
      >
        <mat-chip-option [value]="null">None</mat-chip-option>
        <mat-chip-option value="days">Daily</mat-chip-option>
        <mat-chip-option value="weeks">Weekly</mat-chip-option>
      </mat-chip-listbox>

      @if (unit(); as chosen) {
        <mat-form-field appearance="outline" class="every">
          <mat-label>{{ chosen === 'days' ? 'Every N days' : 'Every N weeks' }}</mat-label>
          <input
            matInput
            type="number"
            min="1"
            [ngModel]="everyNText()"
            (ngModelChange)="everyNText.set($event)"
          />
          @if (!everyNValid()) {
            <mat-error>At least 1.</mat-error>
          }
        </mat-form-field>
      }

      @if (unit() === 'weeks') {
        <div class="days">
          @for (day of weekdays; track $index) {
            <button
              matButton="outlined"
              type="button"
              class="day"
              [class.selected]="isDaySelected($index)"
              [attr.aria-pressed]="isDaySelected($index)"
              (click)="toggleDay($index)"
            >
              {{ day }}
            </button>
          }
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Cancel</button>
      <button matButton="filled" [disabled]="!canConfirm()" (click)="confirm()">Set</button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      min-width: 16rem;
    }
    .every {
      width: 12rem;
    }
    .days {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .day.selected {
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
  `,
})
export class RecurrencePickerDialog {
  private readonly data = inject<RecurrencePickerData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<RecurrencePickerDialog, Recurrence | null>);

  readonly weekdays = shortWeekdayNames();
  readonly unit = signal<RecurUnit | null>(this.data.initial?.unit ?? null);
  readonly everyNText = signal(String(this.data.initial?.everyN ?? 1));
  readonly daysOfWeek = signal(this.data.initial?.daysOfWeek ?? 0);

  private readonly everyN = computed(() => {
    const text = this.everyNText().trim();
    return /^\d+$/.test(text) ? Number(text) : null;
  });
  readonly everyNValid = computed(() => (this.everyN() ?? 0) >= 1);

  readonly canConfirm = computed(() => {
    if (this.unit() === null) return true;
    if (!this.everyNValid()) return false;
    return this.unit() !== 'weeks' || (this.daysOfWeek() >= 1 && this.daysOfWeek() <= 127);
  });

  pickUnit(unit: RecurUnit | null): void {
    this.unit.set(unit);
    // Weekly with no day selected can never fire; start on today's weekday.
    if (unit === 'weeks' && this.daysOfWeek() === 0) {
      this.daysOfWeek.set(defaultWeekdayBit(Date.now()));
    }
  }

  isDaySelected(index: number): boolean {
    return (this.daysOfWeek() & (1 << index)) !== 0;
  }

  toggleDay(index: number): void {
    this.daysOfWeek.update((mask) => mask ^ (1 << index));
  }

  confirm(): void {
    const unit = this.unit();
    if (unit === null) {
      this.dialogRef.close(null);
      return;
    }
    this.dialogRef.close({
      everyN: this.everyN()!,
      unit,
      daysOfWeek: unit === 'weeks' ? this.daysOfWeek() : 0,
    });
  }
}
