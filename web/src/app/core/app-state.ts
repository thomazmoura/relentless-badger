import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { BadgerService } from './badger.service';
import { GoogleAuthService } from './auth/google-auth.service';
import { buildMonthEntries, CalendarEntry } from './domain/calendar-entries';
import { friendlyMessage } from './domain/errors';
import { rank } from './domain/fuzzy';
import { CompletedTask, isSignedIn, OpenTask, Recurrence, SettingsDto } from './domain/models';
import {
  atDay,
  dateAt,
  dateKey,
  LocalDate,
  plusMonths,
  sameYearMonth,
  startOfDay,
  systemZone,
  YearMonth,
  yearMonthOf,
} from './domain/time';
import { BadgerStoreService } from './store.service';

/** How often the task list recomputes countdowns and re-partitions itself. */
const TICK_MILLIS = 15_000;

/**
 * Everything the screens read and every action they can take — the port of
 * AppViewModel. One instance for the whole app, so state survives moving
 * between tabs and in and out of Settings.
 */
@Injectable({ providedIn: 'root' })
export class AppState {
  private readonly badger = inject(BadgerService);
  private readonly storeService = inject(BadgerStoreService);
  private readonly google = inject(GoogleAuthService);

  private readonly repository = this.badger.repository;
  readonly zone = systemZone();

  // --- session and tasks ---------------------------------------------------

  readonly session = this.badger.session.session;
  readonly signedIn = computed(() => isSignedIn(this.session()));
  readonly openTasks = this.repository.openTasks();
  readonly syncing = this.badger.sync.syncing;
  readonly notificationPermission = this.badger.reminders.permission;

  /** Ticks so "next nag in 3 min" stays true without a manual refresh. */
  readonly nowMillis = signal(Date.now());

  readonly busy = signal(false);
  readonly errorMessage = signal<string | null>(null);

  /** No Google client id in this build means only the dev bypass can sign in. */
  readonly devLoginAvailable = this.google.devLoginAvailable;
  readonly configuredBaseUrl = environment.apiBaseUrl;

  // --- quick add -----------------------------------------------------------

  readonly quickAddText = signal('');
  readonly quickAddFirstWarningAtMillis = signal<number | null>(null);
  readonly quickAddRecurrence = signal<Recurrence | null>(null);
  readonly titleHistory = signal<string[]>([]);
  readonly dismissedSuggestion = signal<string | null>(null);

  readonly suggestions = computed(() => {
    const query = this.quickAddText();
    if (query.trim() === '') return [];
    return rank(query, this.titleHistory()).filter(
      (title) => title.toLowerCase() !== query.toLowerCase(),
    );
  });

  // --- dialogs -------------------------------------------------------------

  readonly editingTask = signal<OpenTask | null>(null);
  readonly waitPickerTask = signal<OpenTask | null>(null);
  readonly exactWaitTask = signal<OpenTask | null>(null);

  // --- calendar ------------------------------------------------------------

  readonly calendarMonth = signal<YearMonth>(yearMonthOf(Date.now(), this.zone));
  readonly selectedCalendarDate = signal<LocalDate>(dateAt(Date.now(), this.zone));
  /** Cancelled tasks are history, but not achievements — opt in to see them. */
  readonly showCancelledInCalendar = signal(
    this.storeService.store.currentUi().showCancelledInCalendar,
  );

  private readonly monthStart = computed(() =>
    startOfDay(atDay(this.calendarMonth(), 1), this.zone),
  );
  private readonly monthEnd = computed(() =>
    startOfDay(atDay(plusMonths(this.calendarMonth(), 1), 1), this.zone),
  );
  readonly completedInMonth: () => CompletedTask[] = this.repository.observeCompletedBetween(
    this.monthStart,
    this.monthEnd,
  );

  readonly calendarEntries = computed(() =>
    buildMonthEntries(
      this.openTasks(),
      this.completedInMonth(),
      this.calendarMonth(),
      this.zone,
      this.showCancelledInCalendar(),
    ),
  );

  readonly selectedDayEntries = computed<CalendarEntry[]>(
    () => this.calendarEntries().get(dateKey(this.selectedCalendarDate())) ?? [],
  );

  constructor() {
    const ticker = setInterval(() => this.nowMillis.set(Date.now()), TICK_MILLIS);
    inject(DestroyRef).onDestroy(() => clearInterval(ticker));
    void this.badger.start();
    void this.loadTitles();
  }

  // --- actions -------------------------------------------------------------

  async signInWithGoogle(buttonHost: HTMLElement, baseUrl: string): Promise<void> {
    await this.signIn(baseUrl, () => this.google.renderButton(buttonHost));
  }

  async signInAsDev(baseUrl: string): Promise<void> {
    await this.signIn(baseUrl, async () => 'dev-token');
  }

  private async signIn(baseUrl: string, idToken: () => Promise<string>): Promise<void> {
    if (baseUrl.trim() === '') {
      this.errorMessage.set('Enter the server URL first.');
      return;
    }
    await this.runBusy(async () => {
      await this.badger.session.saveBaseUrl(baseUrl);
      const response = await this.badger.api.login({ idToken: await idToken() });
      await this.badger.session.saveLogin(response.token, response.email, response.settings);
      await this.refresh(true);
      // Reminders are the whole point of the app; ask as soon as there is a
      // gesture-adjacent moment to ask in.
      if (this.notificationPermission() === 'default') {
        await this.badger.reminders.requestPermission();
      }
    });
  }

  /** Pull from the server. Connectivity errors only surface when asked for. */
  async refresh(interactive = false): Promise<void> {
    if (!this.signedIn()) return;
    try {
      await this.badger.sync.flush();
    } catch (error) {
      if (interactive) this.errorMessage.set(friendlyMessage(error));
    }
    await this.loadTitles();
  }

  async addTask(title = this.quickAddText()): Promise<void> {
    const trimmed = title.trim();
    if (trimmed === '') return;
    const firstWarning = this.quickAddFirstWarningAtMillis();
    const recurrence = this.quickAddRecurrence();
    // Cleared before the await so a second tap can't create the task twice.
    this.quickAddText.set('');
    this.quickAddFirstWarningAtMillis.set(null);
    this.quickAddRecurrence.set(null);
    await this.runBusy(async () => {
      if (recurrence !== null && firstWarning === null) {
        throw new Error('Pick a start time for a repeating task.');
      }
      await this.repository.addTask(trimmed, firstWarning, recurrence);
      await this.loadTitles();
    });
  }

  async dismissSuggestion(title: string): Promise<void> {
    await this.repository.dismissTitle(title);
    await this.loadTitles();
    this.dismissedSuggestion.set(title);
  }

  async undoDismissSuggestion(title: string): Promise<void> {
    await this.repository.restoreTitle(title);
    await this.loadTitles();
  }

  async completeTask(id: string): Promise<void> {
    await this.runBusy(() => this.repository.completeTask(id));
  }

  async cancelTask(id: string): Promise<void> {
    await this.runBusy(() => this.repository.cancelTask(id));
  }

  beginEditSchedule(task: OpenTask): void {
    this.editingTask.set(task);
  }

  async saveSchedule(
    id: string,
    firstWarningAtMillis: number | null,
    repeatIntervalMinutes: number,
    recurrence: Recurrence | null,
  ): Promise<void> {
    this.editingTask.set(null);
    await this.runBusy(() =>
      this.repository.editSchedule(id, firstWarningAtMillis, repeatIntervalMinutes, recurrence),
    );
  }

  /** Opened from a reminder's body tap; silently no-ops if the task is gone. */
  async openWaitPicker(id: string): Promise<void> {
    const task = await this.repository.openTask(id);
    if (task) this.waitPickerTask.set(task);
  }

  async snoozeTask(id: string, minutes: number): Promise<void> {
    this.waitPickerTask.set(null);
    await this.runBusy(() => this.repository.snoozeTask(id, minutes));
  }

  async snoozeUntil(id: string, atMillis: number): Promise<void> {
    this.waitPickerTask.set(null);
    this.exactWaitTask.set(null);
    await this.runBusy(() => this.repository.snoozeUntil(id, atMillis));
  }

  async saveSettings(settings: SettingsDto, onDone: () => void): Promise<void> {
    await this.runBusy(async () => {
      await this.repository.updateSettings(settings);
      onDone();
    });
  }

  async changeServerUrl(url: string): Promise<void> {
    await this.runBusy(() => this.repository.changeServer(url));
  }

  async signOut(): Promise<void> {
    await this.runBusy(async () => {
      await this.repository.signOut();
      await this.badger.session.clear();
      this.quickAddText.set('');
      this.quickAddFirstWarningAtMillis.set(null);
      this.quickAddRecurrence.set(null);
      this.editingTask.set(null);
      this.titleHistory.set([]);
    });
  }

  showCalendarMonth(month: YearMonth): void {
    this.calendarMonth.set(month);
    // Landing on the current month should select today, not the 1st.
    const today = dateAt(Date.now(), this.zone);
    this.selectedCalendarDate.set(
      sameYearMonth(month, yearMonthOf(Date.now(), this.zone)) ? today : atDay(month, 1),
    );
  }

  toggleShowCancelled(show: boolean): void {
    this.showCancelledInCalendar.set(show);
    this.storeService.store.patchUi({ showCancelledInCalendar: show });
  }

  async requestNotificationPermission(): Promise<void> {
    await this.badger.reminders.requestPermission();
  }

  private async loadTitles(): Promise<void> {
    this.titleHistory.set(await this.repository.titles());
  }

  private async runBusy(block: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await block();
    } catch (error) {
      this.errorMessage.set(friendlyMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
