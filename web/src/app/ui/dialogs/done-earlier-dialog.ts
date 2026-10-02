import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { formatDateTime } from '../../core/domain/format';
import { DoneEarlierCandidates } from '../../core/domain/models';
import { I18n } from '../../core/i18n/i18n.service';

export interface DoneEarlierData {
  readonly atMillis: number;
  readonly candidates: DoneEarlierCandidates;
  readonly use24Hour: boolean;
}

/** The ticked ids, or 'change' to go back and pick another moment. */
export type DoneEarlierResult =
  { readonly openIds: string[]; readonly completedIds: string[] } | 'change';

/**
 * Second step of "mark done earlier": with the moment picked, tick everything
 * that was done at it. Open tasks get completed there; completions already
 * recorded get moved there — the Done tapped this morning for last night's work.
 * Nothing starts ticked, since a stray confirm would close tasks still owed.
 */
@Component({
  selector: 'app-done-earlier-dialog',
  imports: [MatButtonModule, MatCheckboxModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ s().doneEarlierAt(format(data.atMillis)) }}</h2>
    <mat-dialog-content>
      <button matButton [mat-dialog-close]="'change'">{{ s().changeMoment }}</button>
      @if (data.candidates.open.length === 0 && data.candidates.completed.length === 0) {
        <p>{{ s().nothingToMark }}</p>
      }
      @if (data.candidates.open.length > 0) {
        <h3 class="section">{{ s().doneEarlierOpen }}</h3>
        @for (task of data.candidates.open; track task.id) {
          <mat-checkbox
            class="row"
            [checked]="openPicked().has(task.id)"
            (change)="toggle(openPicked, task.id)"
          >
            {{ task.title }}
          </mat-checkbox>
        }
      }
      @if (data.candidates.completed.length > 0) {
        <h3 class="section">{{ s().doneEarlierAlreadyDone }}</h3>
        @for (done of data.candidates.completed; track done.id) {
          <mat-checkbox
            class="row"
            [checked]="completedPicked().has(done.id)"
            (change)="toggle(completedPicked, done.id)"
          >
            {{ done.title }}
            <span class="supporting">{{ s().doneAtTime(format(done.completedAtMillis)) }}</span>
          </mat-checkbox>
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>{{ s().cancel }}</button>
      <button matButton="filled" [disabled]="count() === 0" [mat-dialog-close]="result()">
        {{ s().markNDone(count()) }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .section {
      margin: 16px 0 4px;
      font: var(--mat-sys-title-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .row {
      display: block;
    }
    .supporting {
      display: block;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class DoneEarlierDialog {
  readonly s = inject(I18n).strings;
  readonly data = inject<DoneEarlierData>(MAT_DIALOG_DATA);

  readonly openPicked = signal<ReadonlySet<string>>(new Set());
  readonly completedPicked = signal<ReadonlySet<string>>(new Set());
  readonly count = computed(() => this.openPicked().size + this.completedPicked().size);
  readonly result = computed<DoneEarlierResult>(() => ({
    openIds: [...this.openPicked()],
    completedIds: [...this.completedPicked()],
  }));

  format(millis: number): string {
    return formatDateTime(millis, this.data.use24Hour, undefined, this.s());
  }

  toggle(picked: ReturnType<typeof signal<ReadonlySet<string>>>, id: string): void {
    const next = new Set(picked());
    if (!next.delete(id)) next.add(id);
    picked.set(next);
  }
}
