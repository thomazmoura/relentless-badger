import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelect, MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router } from '@angular/router';
import { AppState } from '../../core/app-state';
import { CRASH_LOG } from '../../core/diagnostics/crash-log';
import { formatDateTime, prefers24Hour } from '../../core/domain/format';
import { MAX_WAITS } from '../../core/domain/models';
import {
  BUILT_IN_SOUNDS,
  notificationSoundSource,
  parseNotificationSound,
} from '../../core/domain/notification-sound';
import { AudioElementSoundPlayer } from '../../core/notify/sound-player';
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
    MatSelectModule,
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
            min="0"
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

        <div class="sound">
          <mat-form-field appearance="outline" class="grow">
            <mat-label>Notification sound</mat-label>
            <mat-select
              [value]="storedSound()"
              (selectionChange)="chooseSound($event.source, $event.value)"
            >
              <mat-option value="silent">Silent</mat-option>
              <mat-option value="system">System default</mat-option>
              @for (sound of builtInSounds; track sound.key) {
                <mat-option [value]="'builtin:' + sound.key">{{ sound.label }}</mat-option>
              }
              @if (sound().kind === 'custom') {
                <mat-option [value]="storedSound()">{{ soundLabel() }}</mat-option>
              }
              <mat-option value="upload">Upload your own…</mat-option>
            </mat-select>
          </mat-form-field>
          <button
            matIconButton
            aria-label="Play notification sound"
            [disabled]="soundSource() === null"
            (click)="previewSound()"
          >
            <mat-icon>play_arrow</mat-icon>
          </button>
        </div>
        <input #soundFile type="file" accept="audio/*" hidden (change)="uploadSound($event)" />
        <p class="hint sound-credit">Built-in sounds: Google Material, CC-BY 4.0</p>

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
          <button
            matButton="outlined"
            class="full"
            [disabled]="state.busy()"
            (click)="state.showTestNotification()"
          >
            Send test notification
          </button>

          <p class="hint">{{ crashSummaryText() }}</p>
          <button
            matButton="outlined"
            class="full"
            [disabled]="crashSummary().count === 0"
            (click)="shareCrashLog()"
          >
            Share crash log
          </button>
          <button
            matButton="outlined"
            class="full"
            [disabled]="crashSummary().count === 0"
            (click)="clearCrashLog()"
          >
            Clear crash log
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
    .wait .grow,
    .sound .grow {
      flex: 1;
    }
    .sound {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 1rem;
    }
    .sound-credit {
      margin: -0.75rem 0 0.5rem;
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
  private readonly crashLog = inject(CRASH_LOG);
  private readonly snackBar = inject(MatSnackBar);
  private readonly soundPlayer = new AudioElementSoundPlayer();
  private readonly soundFile = viewChild.required<ElementRef<HTMLInputElement>>('soundFile');

  readonly maxWaits = MAX_WAITS;
  readonly builtInSounds = BUILT_IN_SOUNDS;

  // Read live rather than snapshotted like the Save-button fields: a sound is
  // applied the moment it's chosen.
  readonly storedSound = computed(() => this.state.session().notificationSound);
  readonly sound = computed(() => parseNotificationSound(this.storedSound()));
  readonly soundLabel = computed(() => {
    const sound = this.sound();
    return sound.kind === 'custom' ? sound.label : '';
  });
  readonly soundSource = computed(() => notificationSoundSource(this.sound()));

  private readonly session = this.state.session();
  readonly initialDelay = signal(String(this.session.initialDelayMinutes));
  readonly repeatInterval = signal(String(this.session.repeatIntervalMinutes));
  readonly waits = signal<string[]>(this.session.waitMinutes.map(String));
  readonly defaultWaitIndex = signal(this.session.defaultWaitIndex);
  readonly showAdvanced = signal(false);
  readonly serverUrl = signal(this.session.baseUrl);

  readonly crashSummary = signal(this.crashLog.summary());
  readonly crashSummaryText = computed(() => {
    const { count, latestMillis } = this.crashSummary();
    if (count === 0) return 'No crashes recorded';
    const latest =
      latestMillis === null ? 'unknown' : formatDateTime(latestMillis, prefers24Hour());
    return `${count} ${count === 1 ? 'crash' : 'crashes'} recorded, latest ${latest}`;
  });

  readonly normalizedServerUrl = computed(() => this.serverUrl().trim().replace(/\/+$/, ''));

  readonly valid = computed(() => {
    const initialDelay = parseNonNegative(this.initialDelay());
    const numbers = [this.repeatInterval(), ...this.waits()].map(parsePositive);
    return (
      initialDelay !== null &&
      numbers.every((value) => value !== null) &&
      this.waits().length > 0 &&
      this.defaultWaitIndex() >= 0 &&
      this.defaultWaitIndex() < this.waits().length
    );
  });

  /** Hearing a sound is how you pick one, so choosing it also plays it. */
  async chooseSound(select: MatSelect, value: string): Promise<void> {
    if (value === 'upload') {
      // "Upload" is an action, not a choice: put the select back on the
      // current sound until a file actually arrives.
      select.value = this.storedSound();
      this.soundFile().nativeElement.click();
      return;
    }
    await this.state.updateNotificationSound(parseNotificationSound(value));
    this.previewSound();
  }

  previewSound(): void {
    const source = this.soundSource();
    if (source === null) return;
    this.soundPlayer.play(source).catch(() => {
      this.snackBar.open('This browser could not play that sound', undefined, { duration: 4000 });
    });
  }

  /**
   * Stored inline in local storage as a data URL, so the size is capped well
   * below the quota: an oversized sound must not crowd out the task database.
   */
  async uploadSound(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // so picking the same file again still fires change
    if (!file) return;
    if (file.size > MAX_SOUND_BYTES) {
      this.snackBar.open('That sound is too big \u2014 pick one under 500 KB', undefined, {
        duration: 4000,
      });
      return;
    }
    const uri = await readAsDataUrl(file);
    if (uri === null || !(await isPlayable(uri))) {
      this.snackBar.open('That file is not a sound this browser can play', undefined, {
        duration: 4000,
      });
      return;
    }
    await this.state.updateNotificationSound({ kind: 'custom', uri, label: file.name });
    this.previewSound();
  }

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
        initialDelayMinutes: parseNonNegative(this.initialDelay())!,
        repeatIntervalMinutes: parsePositive(this.repeatInterval())!,
        waitMinutes: this.waits().map((wait) => parsePositive(wait)!),
        defaultWaitIndex: this.defaultWaitIndex(),
        // Not editable here — carried through so saving on this client can't
        // wipe quiet hours set on the phone.
        quietHours: this.session.quietHours,
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

  /** The share sheet where the browser has one (phones), otherwise a file download. */
  async shareCrashLog(): Promise<void> {
    const text = this.crashLog.read();
    if (navigator.share) {
      try {
        await navigator.share({ title: 'RelentlessBadger crash log', text });
        return;
      } catch (error) {
        // Dismissing the sheet is not a reason to download instead.
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'relentlessbadger-crash-log.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  async clearCrashLog(): Promise<void> {
    const confirmed = await this.dialog
      .open(ConfirmDialog, {
        data: {
          title: 'Clear crash log?',
          message:
            "Recorded crashes are deleted from this device. Share them first if they're still needed.",
          confirmLabel: 'Clear',
        },
      })
      .afterClosed()
      .toPromise();
    if (!confirmed) return;
    this.crashLog.clear();
    this.crashSummary.set(this.crashLog.summary());
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

function parseNonNegative(text: string): number | null {
  const trimmed = String(text).trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

const MAX_SOUND_BYTES = 500 * 1024;

function readAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/** accept="audio/*" is only a hint, so make sure the browser can actually decode it. */
function isPlayable(uri: string): Promise<boolean> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.onloadedmetadata = () => resolve(true);
    audio.onerror = () => resolve(false);
    audio.src = uri;
  });
}
