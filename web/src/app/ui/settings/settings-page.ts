import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Location } from '@angular/common';
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
import {
  deviceLanguageTag,
  LANGUAGE_PREFERENCES,
  LanguagePreference,
  languageName,
  parseLanguagePreference,
  resolveLanguage,
} from '../../core/domain/language';
import { MAX_WAITS, SettingsDto } from '../../core/domain/models';
import {
  BUILT_IN_SOUNDS,
  notificationSoundSource,
  parseNotificationSound,
  toStorageString,
} from '../../core/domain/notification-sound';
import { I18n } from '../../core/i18n/i18n.service';
import { AudioElementSoundPlayer } from '../../core/notify/sound-player';
import { ConfirmDialog } from '../dialogs/confirm-dialog';

/**
 * Defaults for new tasks, the snooze options every task and reminder offers,
 * and the escape hatches: sign out and point the app at another server.
 *
 * Edits are a draft held against the stored session: Apply and Undo float in
 * while it differs, and leaving the page applies whatever is still pending.
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
      <button matIconButton [attr.aria-label]="s().back" (click)="back()">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <span>{{ s().settings }}</span>
    </mat-toolbar>

    <div class="body">
      <div class="page-body">
        <mat-form-field appearance="outline">
          <mat-label>{{ s().languageLabel }}</mat-label>
          <mat-select [value]="draftLanguage()" (selectionChange)="draftLanguage.set($event.value)">
            @for (option of languageOptions; track option) {
              <mat-option [value]="option">{{ languageOptionLabel(option) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <p class="hint">{{ s().defaultsIntro }}</p>

        <mat-form-field appearance="outline">
          <mat-label>{{ s().firstReminderAfter }}</mat-label>
          <input
            matInput
            type="number"
            min="0"
            [ngModel]="initialDelay()"
            (ngModelChange)="initialDelay.set($event)"
          />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>{{ s().thenNagEvery }}</mat-label>
          <input
            matInput
            type="number"
            min="1"
            [ngModel]="repeatInterval()"
            (ngModelChange)="repeatInterval.set($event)"
          />
        </mat-form-field>

        <p class="hint">{{ s().snoozeIntro }}</p>

        @for (wait of waits(); track $index) {
          <div class="wait">
            <mat-form-field appearance="outline" class="grow">
              <mat-label>{{ s().waitField($index + 1) }}</mat-label>
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
              [attr.aria-label]="s().useWaitAsDefault($index + 1)"
            />
            <button
              matIconButton
              [attr.aria-label]="s().removeWait($index + 1)"
              [disabled]="waits().length <= 1"
              (click)="removeWait($index)"
            >
              <mat-icon>delete</mat-icon>
            </button>
          </div>
        }

        <button matButton [disabled]="waits().length >= maxWaits" (click)="addWait()">
          {{ s().addWait }}
        </button>

        <div class="sound">
          <mat-form-field appearance="outline" class="grow">
            <mat-label>{{ s().notificationSound }}</mat-label>
            <mat-select
              [value]="draftSound()"
              (selectionChange)="chooseSound($event.source, $event.value)"
            >
              <mat-option value="silent">{{ s().soundSilent }}</mat-option>
              <mat-option value="system">{{ s().soundSystemDefault }}</mat-option>
              @for (sound of builtInSounds; track sound.key) {
                <mat-option [value]="'builtin:' + sound.key">{{
                  s().builtInSoundName(sound.key)
                }}</mat-option>
              }
              @if (sound().kind === 'custom') {
                <mat-option [value]="draftSound()">{{ soundLabel() }}</mat-option>
              }
              <mat-option value="upload">{{ s().uploadSound }}</mat-option>
            </mat-select>
          </mat-form-field>
          <button
            matIconButton
            [attr.aria-label]="s().playNotificationSound"
            [disabled]="soundSource() === null"
            (click)="previewSound()"
          >
            <mat-icon>play_arrow</mat-icon>
          </button>
        </div>
        <input #soundFile type="file" accept="audio/*" hidden (change)="uploadSound($event)" />
        <p class="hint sound-credit">{{ s().builtInSoundsCredit }}</p>

        <p class="signed-in">{{ s().signedInAs(state.session().email ?? s().unknown) }}</p>
        <button matButton="outlined" class="full" (click)="signOut()">{{ s().signOut }}</button>

        <button matButton (click)="showAdvanced.set(!showAdvanced())">
          {{ showAdvanced() ? s().hideAdvanced : s().advanced }}
        </button>

        @if (showAdvanced()) {
          <mat-form-field appearance="outline">
            <mat-label>{{ s().serverUrl }}</mat-label>
            <input matInput [ngModel]="serverUrl()" (ngModelChange)="serverUrl.set($event)" />
            <mat-hint>{{ s().serverUrlHintShort }}</mat-hint>
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
            {{ s().changeServerUrl }}
          </button>
          <button
            matButton="outlined"
            class="full"
            [disabled]="state.busy()"
            (click)="state.showTestNotification()"
          >
            {{ s().sendTestNotification }}
          </button>

          <p class="hint">{{ crashSummaryText() }}</p>
          <button
            matButton="outlined"
            class="full"
            [disabled]="crashSummary().count === 0"
            (click)="shareCrashLog()"
          >
            {{ s().shareCrashLog }}
          </button>
          <button
            matButton="outlined"
            class="full"
            [disabled]="crashSummary().count === 0"
            (click)="clearCrashLog()"
          >
            {{ s().clearCrashLog }}
          </button>
        }
      </div>
    </div>

    @if (changed()) {
      <div class="fabs">
        <button matFab extended class="undo" (click)="undo()">
          <mat-icon>undo</mat-icon>
          {{ s().undo }}
        </button>
        <button matFab extended [disabled]="!valid() || state.busy()" (click)="apply()">
          <mat-icon>check</mat-icon>
          {{ s().applyAction }}
        </button>
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }
    .body {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
      /* Room to scroll the last rows out from under Apply and Undo. */
      padding-bottom: 6rem;
    }
    .fabs {
      position: absolute;
      right: 1rem;
      bottom: calc(1rem + env(safe-area-inset-bottom));
      display: flex;
      gap: 0.75rem;
    }
    .fabs .undo {
      --mat-fab-container-color: var(--mat-sys-secondary-container);
      --mat-fab-foreground-color: var(--mat-sys-on-secondary-container);
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
  readonly s = inject(I18n).strings;
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly dialog = inject(MatDialog);
  private readonly crashLog = inject(CRASH_LOG);
  private readonly snackBar = inject(MatSnackBar);
  private readonly soundPlayer = new AudioElementSoundPlayer();
  private readonly soundFile = viewChild.required<ElementRef<HTMLInputElement>>('soundFile');

  readonly maxWaits = MAX_WAITS;
  readonly builtInSounds = BUILT_IN_SOUNDS;

  private readonly session = this.state.session();
  readonly draftSound = signal(this.session.notificationSound);
  readonly draftLanguage = signal<LanguagePreference>(
    parseLanguagePreference(this.session.language),
  );
  readonly languageOptions = LANGUAGE_PREFERENCES;
  readonly sound = computed(() => parseNotificationSound(this.draftSound()));
  readonly soundLabel = computed(() => {
    const sound = this.sound();
    return sound.kind === 'custom' ? sound.label : '';
  });
  readonly soundSource = computed(() => notificationSoundSource(this.sound()));

  readonly initialDelay = signal(String(this.session.initialDelayMinutes));
  readonly repeatInterval = signal(String(this.session.repeatIntervalMinutes));
  readonly waits = signal<string[]>(this.session.waitMinutes.map(String));
  readonly defaultWaitIndex = signal(this.session.defaultWaitIndex);
  readonly showAdvanced = signal(false);
  readonly serverUrl = signal(this.session.baseUrl);

  readonly crashSummary = signal(this.crashLog.summary());
  readonly crashSummaryText = computed(() => {
    const { count, latestMillis } = this.crashSummary();
    const s = this.s();
    if (count === 0) return s.noCrashes;
    const latest =
      latestMillis === null
        ? s.unknown
        : formatDateTime(latestMillis, prefers24Hour(), undefined, s);
    return s.crashesRecorded(count, latest);
  });

  readonly normalizedServerUrl = computed(() => this.serverUrl().trim().replace(/\/+$/, ''));

  // Measured against the stored session rather than a snapshot, so an Apply
  // makes the draft clean again and Undo always lands on what is in force.
  readonly changed = computed(() => {
    const stored = this.state.session();
    const waits = this.waits().map(parsePositive);
    return (
      parseNonNegative(this.initialDelay()) !== stored.initialDelayMinutes ||
      parsePositive(this.repeatInterval()) !== stored.repeatIntervalMinutes ||
      waits.length !== stored.waitMinutes.length ||
      waits.some((wait, i) => wait !== stored.waitMinutes[i]) ||
      this.defaultWaitIndex() !== stored.defaultWaitIndex ||
      this.draftSound() !== stored.notificationSound ||
      this.draftLanguage() !== parseLanguagePreference(stored.language)
    );
  });

  /** Set on sign-out, whose navigation must not try to save into a cleared session. */
  private leaving = false;

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

  /**
   * Each language is named in itself, so someone lost in the wrong one can
   * still find theirs; "device default" also says which language the browser
   * currently resolves to.
   */
  languageOptionLabel(option: LanguagePreference): string {
    if (option !== 'system') return languageName(option);
    return this.s().languageDeviceDefault(
      languageName(resolveLanguage('system', deviceLanguageTag())),
    );
  }

  /** Hearing a sound is how you pick one, so choosing it also plays it. */
  async chooseSound(select: MatSelect, value: string): Promise<void> {
    if (value === 'upload') {
      // "Upload" is an action, not a choice: put the select back on the
      // current sound until a file actually arrives.
      select.value = this.draftSound();
      this.soundFile().nativeElement.click();
      return;
    }
    this.draftSound.set(value);
    this.previewSound();
  }

  previewSound(): void {
    const source = this.soundSource();
    if (source === null) return;
    this.soundPlayer.play(source).catch(() => {
      this.snackBar.open(this.s().couldNotPlaySound, undefined, { duration: 4000 });
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
      this.snackBar.open(this.s().soundTooBig, undefined, {
        duration: 4000,
      });
      return;
    }
    const uri = await readAsDataUrl(file);
    if (uri === null || !(await isPlayable(uri))) {
      this.snackBar.open(this.s().notASound, undefined, {
        duration: 4000,
      });
      return;
    }
    this.draftSound.set(toStorageString({ kind: 'custom', uri, label: file.name }));
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

  undo(): void {
    const stored = this.state.session();
    this.initialDelay.set(String(stored.initialDelayMinutes));
    this.repeatInterval.set(String(stored.repeatIntervalMinutes));
    this.waits.set(stored.waitMinutes.map(String));
    this.defaultWaitIndex.set(stored.defaultWaitIndex);
    this.draftSound.set(stored.notificationSound);
    this.draftLanguage.set(parseLanguagePreference(stored.language));
  }

  async apply(): Promise<boolean> {
    if (!this.valid()) return false;
    const settings: SettingsDto = {
      initialDelayMinutes: parseNonNegative(this.initialDelay())!,
      repeatIntervalMinutes: parsePositive(this.repeatInterval())!,
      waitMinutes: this.waits().map((wait) => parsePositive(wait)!),
      defaultWaitIndex: this.defaultWaitIndex(),
      // Not editable here — carried through so saving on this client can't
      // wipe quiet hours set on the phone.
      quietHours: this.state.session().quietHours,
    };
    return this.state.saveSettings(
      settings,
      parseNotificationSound(this.draftSound()),
      this.draftLanguage(),
    );
  }

  /**
   * The route's canDeactivate, so the toolbar arrow and the browser's back
   * both apply pending edits on the way out. Invalid ones hold the page
   * instead of being dropped: nothing typed is lost without choosing Undo.
   */
  async leave(): Promise<boolean> {
    if (this.leaving || !this.changed()) return true;
    if (!this.valid()) {
      this.snackBar.open(this.s().fixHighlightedOrUndo, undefined, {
        duration: 4000,
      });
      return false;
    }
    return this.apply();
  }

  async changeServer(): Promise<void> {
    const confirmed = await this.dialog
      .open(ConfirmDialog, {
        data: {
          title: this.s().changeServerTitle,
          message: this.s().changeServerBody,
          confirmLabel: this.s().changeServer,
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
          title: this.s().clearCrashLogTitle,
          message: this.s().clearCrashLogBody,
          confirmLabel: this.s().clear,
        },
      })
      .afterClosed()
      .toPromise();
    if (!confirmed) return;
    this.crashLog.clear();
    this.crashSummary.set(this.crashLog.summary());
  }

  async signOut(): Promise<void> {
    this.leaving = true;
    await this.state.signOut();
    await this.router.navigate(['/signin']);
  }

  /** Back through history when Settings was opened in-app, so it isn't left behind as a forward stop. */
  back(): void {
    if (this.router.lastSuccessfulNavigation()?.previousNavigation) {
      this.location.back();
    } else {
      void this.router.navigate(['/'], { replaceUrl: true });
    }
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
