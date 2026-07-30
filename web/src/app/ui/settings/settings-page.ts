import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router } from '@angular/router';
import { AppState } from '../../core/app-state';
import { MAX_WAITS } from '../../core/domain/models';
import { ConfirmDialog } from '../dialogs/confirm-dialog';

/**
 * Defaults for new tasks, the snooze options every task and reminder offers,
 * and the escape hatches: sign out and point the app at another server.
 */
@Component({
  selector: 'app-settings-page',
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatRadioModule,
    MatToolbarModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar>
      <button matIconButton aria-label="Back" (click)="back()">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <span>Settings</span>
    </mat-toolbar>

    <div class="body">
      <div class="page-body">
        <p class="hint">
          Defaults applied to every new task. Existing tasks keep the values they were created with.
        </p>

        <mat-form-field appearance="outline">
          <mat-label>First reminder after (minutes)</mat-label>
          <input
            matInput
            type="number"
            min="1"
            [ngModel]="initialDelay()"
            (ngModelChange)="initialDelay.set($event)"
          />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Then nag every (minutes)</mat-label>
          <input
            matInput
            type="number"
            min="1"
            [ngModel]="repeatInterval()"
            (ngModelChange)="repeatInterval.set($event)"
          />
        </mat-form-field>

        <p class="hint">
          Snooze options shown on tasks and reminders. Pick how far each pushes the next nag. The
          one marked default is the reminder's one-tap Wait button.
        </p>

        @for (wait of waits(); track $index) {
          <div class="wait">
            <mat-form-field appearance="outline" class="grow">
              <mat-label>Wait {{ $index + 1 }} (minutes)</mat-label>
              <input
                matInput
                type="number"
                min="1"
                [ngModel]="wait"
                (ngModelChange)="setWait($index, $event)"
              />
            </mat-form-field>
            <mat-radio-button
              [checked]="defaultWaitIndex() === $index"
              (change)="defaultWaitIndex.set($index)"
              [attr.aria-label]="'Use wait ' + ($index + 1) + ' as the default'"
            />
            <button
              matIconButton
              [attr.aria-label]="'Remove wait ' + ($index + 1)"
              [disabled]="waits().length <= 1"
              (click)="removeWait($index)"
            >
              <mat-icon>delete</mat-icon>
            </button>
          </div>
        }

        <button matButton [disabled]="waits().length >= maxWaits" (click)="addWait()">
          Add wait
        </button>

        <button
          matButton="filled"
          class="save"
          [disabled]="!valid() || state.busy()"
          (click)="save()"
        >
          Save
        </button>

        <p class="signed-in">Signed in as {{ state.session().email ?? 'unknown' }}</p>
        <button matButton="outlined" class="full" (click)="signOut()">Sign out</button>

        <button matButton (click)="showAdvanced.set(!showAdvanced())">
          {{ showAdvanced() ? 'Hide advanced' : 'Advanced' }}
        </button>

        @if (showAdvanced()) {
          <mat-form-field appearance="outline">
            <mat-label>Server URL</mat-label>
            <input matInput [ngModel]="serverUrl()" (ngModelChange)="serverUrl.set($event)" />
            <mat-hint>The machine running the API</mat-hint>
          </mat-form-field>
          <button
            matButton="outlined"
            class="full"
            [disabled]="
              state.busy() ||
              normalizedServerUrl() === '' ||
              normalizedServerUrl() === state.session().baseUrl
            "
            (click)="changeServer()"
          >
            Change server URL
          </button>
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
    .body {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
    }
    .page-body {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
      margin: 0.5rem 0 0;
    }
    .wait {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .wait .grow {
      flex: 1;
    }
    .save,
    .full {
      width: 100%;
    }
    .signed-in {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      margin: 1rem 0 0;
    }
  `,
})
export class SettingsPage {
  readonly state = inject(AppState);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);

  readonly maxWaits = MAX_WAITS;

  private readonly session = this.state.session();
  readonly initialDelay = signal(String(this.session.initialDelayMinutes));
  readonly repeatInterval = signal(String(this.session.repeatIntervalMinutes));
  readonly waits = signal<string[]>(this.session.waitMinutes.map(String));
  readonly defaultWaitIndex = signal(this.session.defaultWaitIndex);
  readonly showAdvanced = signal(false);
  readonly serverUrl = signal(this.session.baseUrl);

  readonly normalizedServerUrl = computed(() => this.serverUrl().trim().replace(/\/+$/, ''));

  readonly valid = computed(() => {
    const numbers = [this.initialDelay(), this.repeatInterval(), ...this.waits()].map(
      parsePositive,
    );
    return (
      numbers.every((value) => value !== null) &&
      this.waits().length > 0 &&
      this.defaultWaitIndex() >= 0 &&
      this.defaultWaitIndex() < this.waits().length
    );
  });

  setWait(index: number, value: string): void {
    this.waits.update((waits) => waits.map((wait, i) => (i === index ? value : wait)));
  }

  addWait(): void {
    this.waits.update((waits) => [...waits, '60']);
  }

  removeWait(index: number): void {
    this.waits.update((waits) => waits.filter((_, i) => i !== index));
    // Keep the default pointing at a wait that still exists.
    this.defaultWaitIndex.update((current) =>
      current >= index && current > 0 ? current - 1 : current,
    );
  }

  async save(): Promise<void> {
    if (!this.valid()) return;
    await this.state.saveSettings(
      {
        initialDelayMinutes: parsePositive(this.initialDelay())!,
        repeatIntervalMinutes: parsePositive(this.repeatInterval())!,
        waitMinutes: this.waits().map((wait) => parsePositive(wait)!),
        defaultWaitIndex: this.defaultWaitIndex(),
      },
      () => this.back(),
    );
  }

  async changeServer(): Promise<void> {
    const confirmed = await this.dialog
      .open(ConfirmDialog, {
        data: {
          title: 'Change server?',
          message:
            'Your current session may be rejected by the new server, and you may need to sign in again. Your tasks stay on this device and will sync to the new server.',
          confirmLabel: 'Change server',
        },
      })
      .afterClosed()
      .toPromise();
    if (confirmed) await this.state.changeServerUrl(this.serverUrl());
  }

  async signOut(): Promise<void> {
    await this.state.signOut();
    await this.router.navigate(['/signin']);
  }

  back(): void {
    void this.router.navigate(['/']);
  }
}

function parsePositive(text: string): number | null {
  const trimmed = String(text).trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= 1 ? value : null;
}
