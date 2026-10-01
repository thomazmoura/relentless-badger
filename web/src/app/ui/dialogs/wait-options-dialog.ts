import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { formatDuration } from '../../core/domain/format';
import { I18n } from '../../core/i18n/i18n.service';

export interface WaitOptionsData {
  readonly title: string;
  readonly waitMinutes: readonly number[];
}

/**
 * Closing with a number snoozes by that many minutes; 'duration' opens the typed
 * wait, 'pick' the exact-time picker.
 */
export type WaitOptionsResult = number | 'duration' | 'pick';

/**
 * The anchorless twin of the snooze menu on a task row: same options, shown as
 * a dialog because a reminder tap has no row to anchor to.
 */
@Component({
  selector: 'app-wait-options-dialog',
  imports: [MatButtonModule, MatDialogModule, MatDividerModule, MatIconModule, MatListModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="title">{{ data.title }}</h2>
    <mat-dialog-content class="content">
      <mat-action-list>
        @for (minutes of data.waitMinutes; track minutes) {
          <button mat-list-item (click)="close(minutes)">
            <mat-icon matListItemIcon>snooze</mat-icon>
            <span matListItemTitle>{{ s().waitFor(formatDuration(minutes, s())) }}</span>
          </button>
        }
        <mat-divider />
        <button mat-list-item (click)="close('duration')">
          <mat-icon matListItemIcon>timer</mat-icon>
          <span matListItemTitle>{{ s().waitForDuration }}</span>
        </button>
        <button mat-list-item (click)="close('pick')">
          <mat-icon matListItemIcon>schedule</mat-icon>
          <span matListItemTitle>{{ s().pickDateTime }}</span>
        </button>
      </mat-action-list>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>{{ s().cancel }}</button>
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
      padding: 0;
      min-width: 16rem;
    }
  `,
})
export class WaitOptionsDialog {
  readonly s = inject(I18n).strings;
  readonly data = inject<WaitOptionsData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<WaitOptionsDialog, WaitOptionsResult>);
  readonly formatDuration = formatDuration;

  close(result: WaitOptionsResult): void {
    this.dialogRef.close(result);
  }
}
