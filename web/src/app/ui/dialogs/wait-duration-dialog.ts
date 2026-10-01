import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AppState } from '../../core/app-state';
import { formatDateTime, prefers24Hour } from '../../core/domain/format';
import { parseWaitDuration } from '../../core/domain/wait-duration';
import { I18n } from '../../core/i18n/i18n.service';

export interface WaitDurationData {
  readonly title: string;
}

/**
 * Snoozes for a typed wait such as "27m" or "15m 45s" — the "in a while" the
 * configured waits don't cover, without making the user work out the clock time
 * themselves. The landing moment is previewed so a typo shows before it commits.
 * Closes with the wait in milliseconds.
 */
@Component({
  selector: 'app-wait-duration-dialog',
  imports: [MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="title">{{ data.title }}</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="field">
        <mat-label>{{ s().waitForDuration }}</mat-label>
        <input
          matInput
          cdkFocusInitial
          autocomplete="off"
          [placeholder]="s().waitDurationHint"
          [value]="text()"
          (input)="text.set($any($event.target).value)"
          (keydown.enter)="confirm()"
        />
        @if (durationMillis(); as millis) {
          <mat-hint>{{ s().nextNagAt(landsAt(millis)) }}</mat-hint>
        } @else if (invalid()) {
          <mat-hint class="error">{{ s().waitDurationInvalid }}</mat-hint>
        }
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>{{ s().cancel }}</button>
      <button matButton="filled" [disabled]="durationMillis() === null" (click)="confirm()">
        {{ s().snooze }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .title {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .field {
      display: block;
      width: 16rem;
      max-width: 100%;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class WaitDurationDialog {
  readonly s = inject(I18n).strings;
  readonly data = inject<WaitDurationData>(MAT_DIALOG_DATA);
  private readonly state = inject(AppState);
  private readonly dialogRef = inject(MatDialogRef<WaitDurationDialog, number>);
  private readonly use24Hour = prefers24Hour();

  readonly text = signal('');
  readonly durationMillis = computed(() => parseWaitDuration(this.text()));
  readonly invalid = computed(() => this.text().trim() !== '' && this.durationMillis() === null);

  landsAt(millis: number): string {
    return formatDateTime(this.state.nowMillis() + millis, this.use24Hour, undefined, this.s());
  }

  confirm(): void {
    const millis = this.durationMillis();
    if (millis !== null) this.dialogRef.close(millis);
  }
}
