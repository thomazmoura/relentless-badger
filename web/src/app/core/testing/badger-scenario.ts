import { TaskDto } from '../data/api';
import { BadgerStore } from '../data/local-store';
import { MemoryStorageDriver } from '../data/storage';
import { CompletedTaskStore, OpenTaskStore, TitleStore } from '../data/task-store';
import { TaskRepository } from '../data/task-repository';
import { CompletedTask, OpenTask, Recurrence, SettingsDto } from '../domain/models';
import {
  FakeBadgerApi,
  FakeSettingsStore,
  MutableClock,
  RecordingReminderScheduler,
  RecordingSyncScheduler,
} from './fakes';

/**
 * Given/When/Then harness for the app's business logic: a real repository on a
 * real store over an in-memory medium, with the network, clock, reminders and
 * settings replaced by controllable fakes. Scenarios read as user-visible
 * behavior; none of them care how the repository is wired internally.
 */

/** 2026-01-01T00:00:00Z — scenarios reason in offsets from here. */
export const START_OF_TIME = 1_767_225_600_000;
export const MINUTE = 60_000;

export class BadgerScenario {
  readonly clock = new MutableClock(START_OF_TIME);
  readonly server = new FakeBadgerApi(this.clock);
  readonly alarms = new RecordingReminderScheduler();
  readonly settingsStore = new FakeSettingsStore();
  readonly syncRequests = new RecordingSyncScheduler();

  private readonly store = new BadgerStore(new MemoryStorageDriver());

  readonly taskDao = new OpenTaskStore(this.store);
  readonly titleDao = new TitleStore(this.store);
  readonly completedDao = new CompletedTaskStore(this.store);

  readonly repository = new TaskRepository(
    this.server,
    this.taskDao,
    this.titleDao,
    this.completedDao,
    this.alarms,
    this.settingsStore,
    this.syncRequests,
    this.clock,
  );

  // --- Given ---

  givenOffline(): void {
    this.server.online = false;
  }

  givenOnline(): void {
    this.server.online = true;
  }

  givenServerHasOpenTask(title: string, firstWarningAtMillis: number | null = null): TaskDto {
    return this.server.seedOpenTask({ title, firstWarningAtMillis });
  }

  givenServerHasCompletedTask(
    title: string,
    completedAtMillis: number,
    cancelled = false,
  ): TaskDto {
    return this.server.seedCompletedTask({ title, completedAtMillis, cancelled });
  }

  async givenLocalSettings(
    initialDelayMinutes: number,
    repeatIntervalMinutes: number,
    waitMinutes: number[] = [60, 240],
    defaultWaitIndex = 0,
    quietHours: string[] = [],
  ): Promise<void> {
    await this.settingsStore.saveSettings({
      initialDelayMinutes,
      repeatIntervalMinutes,
      waitMinutes,
      defaultWaitIndex,
      quietHours,
    });
  }

  /** A task known to both sides with no pending local changes. */
  async givenSyncedTask(title: string): Promise<OpenTask> {
    const dto = this.server.seedOpenTask({ title });
    await this.repository.sync();
    return this.localTask(dto.id);
  }

  // --- When ---

  whenTaskCreated(
    title: string,
    firstWarningAtMillis: number | null = null,
    recurrence: Recurrence | null = null,
  ): Promise<OpenTask> {
    return this.repository.addTask(title, firstWarningAtMillis, recurrence);
  }

  whenTaskCompleted(id: string): Promise<void> {
    return this.repository.completeTask(id);
  }

  whenTaskCancelled(id: string): Promise<void> {
    return this.repository.cancelTask(id);
  }

  whenScheduleEdited(
    id: string,
    firstWarningAtMillis: number | null,
    repeatIntervalMinutes: number,
    recurrence: Recurrence | null = null,
  ): Promise<void> {
    return this.repository.editSchedule(
      id,
      firstWarningAtMillis,
      repeatIntervalMinutes,
      recurrence,
    );
  }

  whenSnoozed(id: string, minutes: number): Promise<void> {
    return this.repository.snoozeTask(id, minutes);
  }

  whenSnoozedUntil(id: string, atMillis: number): Promise<void> {
    return this.repository.snoozeUntil(id, atMillis);
  }

  whenReminderFires(id: string): Promise<void> {
    return this.repository.onReminderFired(id);
  }

  whenBootReArmRuns(): Promise<void> {
    return this.repository.reArmAlarms();
  }

  whenSettingsSaved(settings: SettingsDto): Promise<void> {
    return this.repository.updateSettings(settings);
  }

  whenServerUrlChanged(url: string): Promise<void> {
    return this.repository.changeServer(url);
  }

  async whenServerUrlChangeFailsWith(url: string): Promise<void> {
    try {
      await this.repository.changeServer(url);
    } catch {
      return;
    }
    throw new Error('expected the server URL change to be rejected');
  }

  whenSuggestionDismissed(title: string): Promise<void> {
    return this.repository.dismissTitle(title);
  }

  whenSuggestionDismissalUndone(title: string): Promise<void> {
    return this.repository.restoreTitle(title);
  }

  whenSyncRuns(): Promise<void> {
    return this.repository.sync();
  }

  async whenSyncFailsWith(check: (error: unknown) => boolean = () => true): Promise<void> {
    try {
      await this.repository.sync();
    } catch (error) {
      if (!check(error)) {
        throw new Error(`sync failed with unexpected error: ${error}`);
      }
      return;
    }
    throw new Error('expected sync to fail');
  }

  whenTimeAdvancesMinutes(minutes: number): void {
    this.clock.advanceMinutes(minutes);
  }

  // --- Then ---

  async openTaskTitles(): Promise<string[]> {
    return (await this.taskDao.getActive()).map((task) => task.title);
  }

  async localTask(id: string): Promise<OpenTask> {
    const task = await this.taskDao.getById(id);
    if (task === null) throw new Error(`no local task with id ${id}`);
    return task;
  }

  async localTaskByTitle(title: string): Promise<OpenTask> {
    const task = (await this.taskDao.getAll()).find((row) => row.title === title);
    if (!task) throw new Error(`no local task titled '${title}'`);
    return task;
  }

  async thenTaskVisible(title: string): Promise<void> {
    expect(await this.openTaskTitles(), `expected '${title}' in the open list`).toContain(title);
  }

  async thenTaskGone(title: string): Promise<void> {
    expect(
      await this.openTaskTitles(),
      `expected '${title}' gone from the open list`,
    ).not.toContain(title);
  }

  thenAlarmScheduledAt(id: string, expectedFireAtMillis: number): void {
    expect(this.alarms.scheduled.get(id), `armed alarm for ${id}`).toBe(expectedFireAtMillis);
  }

  thenNoAlarmArmed(id: string): void {
    expect(this.alarms.scheduled.get(id), `expected no armed alarm for ${id}`).toBeUndefined();
  }

  thenServerHasOpenTask(title: string): void {
    expect(
      this.server.openTasks().some((task) => task.title === title),
      `expected server to list '${title}' as open`,
    ).toBe(true);
  }

  thenServerDoesNotHaveOpenTask(title: string): void {
    expect(
      this.server.openTasks().some((task) => task.title === title),
      `expected server not to list '${title}' as open`,
    ).toBe(false);
  }

  async completedCache(): Promise<CompletedTask[]> {
    return this.completedDao.between(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  }

  async thenCompletionCached(
    title: string,
    atMillis: number | null = null,
    cancelled: boolean | null = null,
  ): Promise<void> {
    const entry = (await this.completedCache()).find((row) => row.title === title);
    if (!entry) throw new Error(`expected a cached completion titled '${title}'`);
    if (atMillis !== null) {
      expect(entry.completedAtMillis, `cached completion time for '${title}'`).toBe(atMillis);
    }
    if (cancelled !== null) {
      expect(entry.cancelled, `cached cancelled flag for '${title}'`).toBe(cancelled);
    }
  }

  async thenNoCompletionCached(title: string): Promise<void> {
    expect(
      (await this.completedCache()).some((row) => row.title === title),
      `expected no cached completion titled '${title}'`,
    ).toBe(false);
  }

  thenNothingPushed(): void {
    expect(this.server.receivedCreates, 'expected no creates pushed').toEqual([]);
    expect(this.server.receivedCompletions, 'expected no completions pushed').toEqual([]);
    expect(this.server.receivedSettingsPuts, 'expected no settings pushed').toEqual([]);
    expect(this.server.receivedScheduleUpdates, 'expected no schedule updates pushed').toEqual([]);
  }
}
