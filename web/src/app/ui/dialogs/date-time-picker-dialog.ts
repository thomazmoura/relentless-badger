import { ChangeDetectionStrategy, Component, inject, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { epochFor, partsAt, systemZone } from '../../core/domain/time';

export interface DateTimePickerData {
  readonly title: string;
  readonly initialMillis: number | null;
}

/**
 * Picks an exact moment. The Android flow is a date dialog followed by a time
 * dialog; on a pointer-and-keyboard screen both fit in one, so the two steps
 * become two fields with the same 09:00 default for an unset time.
 */
@Component({
  selector: 'app-date-time-picker-dialog',
  imports: [
    FormsModule,
    MatButtonModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatTimepickerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="field">
        <mat-label>Date</mat-label>
        <input matInput [matDatepicker]="datePicker" [(ngModel)]="date" />
        <mat-datepicker-toggle matIconSuffix [for]="datePicker" />
        <mat-datepicker #datePicker />
      </mat-form-field>
      <mat-form-field appearance="outline" class="field">
        <mat-label>Time</mat-label>
        <input matInput [matTimepicker]="timePicker" [(ngModel)]="time" />
        <mat-timepicker-toggle matIconSuffix [for]="timePicker" />
        <mat-timepicker #timePicker />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Cancel</button>
      <button matButton="filled" [disabled]="!date() || !time()" (click)="confirm()">Set</button>
    </mat-dialog-actions>
  `,
  styles: `
    .field {
      display: block;
      width: 16rem;
      max-width: 100%;
    }
  `,
})
export class DateTimePickerDialog {
  readonly data = inject<DateTimePickerData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<DateTimePickerDialog, number>);
  private readonly zone = systemZone();

  readonly date = model<Date | null>(
    this.data.initialMillis ? new Date(this.data.initialMillis) : new Date(),
  );
  readonly time = model<Date | null>(
    this.data.initialMillis ? new Date(this.data.initialMillis) : atNineInTheMorning(),
  );

  confirm(): void {
    const date = this.date();
    const time = this.time();
    if (!date || !time) return;
    // Both controls hand back a local Date; only the date half of one and the
    // clock half of the other are meaningful.
    this.dialogRef.close(
      epochFor(
        {
          year: date.getFullYear(),
          month: date.getMonth() + 1,
          day: date.getDate(),
          hour: time.getHours(),
          minute: time.getMinutes(),
          second: 0,
          millis: 0,
        },
        this.zone,
      ),
    );
  }
}

function atNineInTheMorning(): Date {
  const now = new Date();
  now.setHours(9, 0, 0, 0);
  return now;
}

/** Exported for the tests and for callers that need the same default. */
export function localPartsOf(millis: number): ReturnType<typeof partsAt> {
  return partsAt(millis, systemZone());
}
