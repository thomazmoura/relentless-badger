import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { AppState } from '../../core/app-state';
import { I18n } from '../../core/i18n/i18n.service';

import { formatDateTime, prefers24Hour, recurrenceLabel } from '../../core/domain/format';
import { DateTimePickerDialog } from '../dialogs/date-time-picker-dialog';
import { RecurrencePickerDialog } from '../dialogs/recurrence-picker-dialog';

/**
 * The one control that has to be fast: type a title, hit add. The schedule and
 * repeat icons are opt-in detours, and the fuzzy suggestion list creates the
 * task straight from a tap rather than just filling the field.
 */
@Component({
  selector: 'app-quick-add',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-form-field appearance="outline" class="field" subscriptSizing="dynamic">
      <button
        matIconButton
        matPrefix
        [attr.aria-label]="s().setFirstReminderTime"
        [class.active]="state.quickAddFirstWarningAtMillis() !== null"
        (click)="pickFirstWarning()"
      >
        <mat-icon>schedule</mat-icon>
      </button>
      <!-- Bound to the DOM value rather than ngModel: adding a task clears the
           signal, and the field has to follow it back to empty. -->
      <input
        matInput
        [placeholder]="s().quickAddPlaceholder"
        [value]="state.quickAddText()"
        (input)="state.quickAddText.set($any($event.target).value)"
        (keydown.enter)="addOrPickTime(state.quickAddText())"
      />
      <span matSuffix class="actions">
        <button
          matIconButton
          [attr.aria-label]="s().setRecurrence"
          [class.active]="state.quickAddRecurrence() !== null"
          (click)="pickRecurrence()"
        >
          <mat-icon>repeat</mat-icon>
        </button>
        <button
          matIconButton
          [attr.aria-label]="s().addTask"
          [disabled]="state.quickAddText().trim() === '' || state.busy()"
          (click)="addOrPickTime(state.quickAddText())"
        >
          <mat-icon>add</mat-icon>
        </button>
      </span>
    </mat-form-field>

    @if (state.quickAddFirstWarningAtMillis() !== null || state.quickAddRecurrence() !== null) {
      <mat-chip-set class="chips">
        @if (state.quickAddFirstWarningAtMillis(); as at) {
          <mat-chip (click)="pickFirstWarning()">
            <mat-icon matChipAvatar>schedule</mat-icon>
            {{ s().firstNag(formatDateTime(at, use24Hour, undefined, s())) }}
            <button
              matChipRemove
              [attr.aria-label]="s().clearFirstReminderTime"
              (click)="clearFirstWarning($event)"
            >
              <mat-icon>cancel</mat-icon>
            </button>
          </mat-chip>
        }
        @if (state.quickAddRecurrence(); as rule) {
          <mat-chip (click)="pickRecurrence()">
            <mat-icon matChipAvatar>repeat</mat-icon>
            {{ recurrenceLabel(rule, s()) }}
            <button
              matChipRemove
              [attr.aria-label]="s().clearRecurrence"
              (click)="clearRecurrence($event)"
            >
              <mat-icon>cancel</mat-icon>
            </button>
          </mat-chip>
        }
      </mat-chip-set>
    }

    @if (state.suggestions().length > 0) {
      <mat-card class="suggestions" appearance="outlined">
        @for (suggestion of state.suggestions(); track suggestion) {
          <div class="suggestion">
            <mat-icon class="history">history</mat-icon>
            <span class="label" (click)="addOrPickTime(suggestion)">{{ suggestion }}</span>
            <button
              matIconButton
              [attr.aria-label]="s().removeSuggestion(suggestion)"
              (click)="state.dismissSuggestion(suggestion)"
            >
              <mat-icon>close</mat-icon>
            </button>
          </div>
        }
      </mat-card>
    }
  `,
  styles: `
    .field {
      width: 100%;
    }
    .actions {
      display: flex;
      align-items: center;
    }
    .active {
      color: var(--mat-sys-primary);
    }
    .chips {
      margin-top: 0.5rem;
    }
    .suggestions {
      margin-top: 0.5rem;
    }
    .suggestion {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding-left: 0.75rem;
    }
    .suggestion .history {
      color: var(--mat-sys-on-surface-variant);
      flex: none;
    }
    .suggestion .label {
      flex: 1;
      min-width: 0;
      cursor: pointer;
      font: var(--mat-sys-body-large);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding: 0.75rem 0;
    }
  `,
})
export class QuickAdd {
  readonly state = inject(AppState);
  readonly s = inject(I18n).strings;
  private readonly dialog = inject(MatDialog);

  readonly use24Hour = prefers24Hour();
  readonly formatDateTime = formatDateTime;
  readonly recurrenceLabel = recurrenceLabel;

  /** A repeating task needs a start time, so ask for one before creating it. */
  async addOrPickTime(title: string): Promise<void> {
    if (title.trim() === '') return;
    if (
      this.state.quickAddRecurrence() !== null &&
      this.state.quickAddFirstWarningAtMillis() === null
    ) {
      await this.pickFirstWarning();
      if (this.state.quickAddFirstWarningAtMillis() === null) return;
    }
    await this.state.addTask(title);
  }

  async pickFirstWarning(): Promise<void> {
    const picked = await this.dialog
      .open(DateTimePickerDialog, {
        data: {
          title: this.s().firstReminder,
          initialMillis: this.state.quickAddFirstWarningAtMillis(),
        },
      })
      .afterClosed()
      .toPromise();
    if (typeof picked === 'number') this.state.quickAddFirstWarningAtMillis.set(picked);
  }

  clearFirstWarning(event: Event): void {
    event.stopPropagation();
    this.state.quickAddFirstWarningAtMillis.set(null);
  }

  async pickRecurrence(): Promise<void> {
    const picked = await this.dialog
      .open(RecurrencePickerDialog, { data: { initial: this.state.quickAddRecurrence() } })
      .afterClosed()
      .toPromise();
    if (picked !== undefined) this.state.quickAddRecurrence.set(picked);
  }

  clearRecurrence(event: Event): void {
    event.stopPropagation();
    this.state.quickAddRecurrence.set(null);
  }
}
