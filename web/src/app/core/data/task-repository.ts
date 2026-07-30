import { Signal } from '@angular/core';
import { ApiError, NetworkError } from '../domain/errors';
import { CompletedTask, OpenTask, Recurrence, SettingsDto, taskRecurrence } from '../domain/models';
import { computeNextFire, computeNextOccurrence, MINUTE_MILLIS } from '../domain/schedule';
import { parseIsoInstant, toIsoInstant } from '../domain/time';
import { nameUuidFromBytes, randomUuid } from '../domain/uuid';
import { ReminderScheduler } from '../notify/reminder-scheduler';
import { SyncScheduler } from '../sync/sync-scheduler';
import { ApiProvider, TaskDto } from './api';
import { Clock, SYSTEM_CLOCK } from './clock';
import { SettingsStore } from './session-store';
import { CompletedTaskStore, OpenTaskStore, TitleStore } from './task-store';

/**
 * All business logic runs against the local database; the network is only
 * touched inside [sync]. Every mutation commits locally, flags what still needs
 * to reach the API (pendingCreate / pendingDone / settings-dirty) and asks the
 * [SyncScheduler] for a push — so the app is fully usable offline.
 */
export class TaskRepository {
  constructor(
    private readonly apiClient: ApiProvider,
    private readonly dao: OpenTaskStore,
    private readonly titleDao: TitleStore,
    private readonly completedDao: CompletedTaskStore,
    private readonly scheduler: ReminderScheduler,
    private readonly settings: SettingsStore,
    private readonly syncScheduler: SyncScheduler,
    private readonly timeSource: Clock = SYSTEM_CLOCK,
  ) {}

  openTasks(): Signal<OpenTask[]> {
    return this.dao.observeActive();
  }

  async openTask(id: string): Promise<OpenTask | null> {
    const task = await this.dao.getById(id);
    return task && !task.pendingDone ? task : null;
  }

  async completedTasksBetween(fromMillis: number, toMillis: number): Promise<CompletedTask[]> {
    return this.completedDao.between(fromMillis, toMillis);
  }

  /** Live version of the above, for the calendar's month window. */
  observeCompletedBetween(
    fromMillis: Signal<number>,
    toMillis: Signal<number>,
  ): Signal<CompletedTask[]> {
    return this.completedDao.observeBetween(fromMillis, toMillis);
  }

  /**
   * Creates the task locally and schedules its first reminder immediately. The
   * id is minted here so a later push (and any retry of it) is idempotent; the
   * row stays flagged pendingCreate until acknowledged. A [recurrence] requires
   * [firstWarningAtMillis]: that time is the first occurrence and anchors the
   * series' cadence and time-of-day.
   */
  async addTask(
    title: string,
    firstWarningAtMillis: number | null = null,
    recurrence: Recurrence | null = null,
  ): Promise<OpenTask> {
    if (recurrence !== null && firstWarningAtMillis === null) {
      throw new Error('a recurring task needs a first occurrence time');
    }
    const now = this.timeSource.now();
    const session = await this.settings.current();
    const id = randomUuid();
    const entity: OpenTask = {
      id,
      title,
      createdAtMillis: now,
      initialDelayMinutes: session.initialDelayMinutes,
      repeatIntervalMinutes: session.repeatIntervalMinutes,
      firstWarningAtMillis,
      nextFireAtMillis: computeNextFire(
        now,
        session.initialDelayMinutes,
        session.repeatIntervalMinutes,
        now,
        firstWarningAtMillis,
      ),
      recurEveryN: recurrence?.everyN ?? null,
      recurUnit: recurrence?.unit ?? null,
      recurDaysOfWeek: recurrence?.unit === 'weeks' ? recurrence.daysOfWeek : null,
      seriesId: recurrence ? id : null,
      pendingDone: false,
      pendingCreate: true,
      pendingUpdate: false,
    };
    await this.dao.upsert(entity);
    this.scheduler.schedule(entity);
    await this.titleDao.recordUse(title, now);
    this.syncScheduler.requestSync();
    return entity;
  }

  /**
   * Marks the task done locally, so the nagging stops immediately even offline.
   * The row stays flagged pendingDone until a sync pushes it. Completing a
   * recurring task spawns the next occurrence as a fresh pendingCreate row, so
   * recurrence works offline too.
   */
  async completeTask(id: string): Promise<void> {
    await this.closeTask(id, false);
  }

  /**
   * Closes the task without doing it: same effect as [completeTask] — nagging
   * stops, the record is kept, a recurring occurrence still spawns the next one
   * — but flagged so reports can leave it out.
   */
  async cancelTask(id: string): Promise<void> {
    await this.closeTask(id, true);
  }

  private async closeTask(id: string, cancelled: boolean): Promise<void> {
    const task = await this.dao.getById(id);
    if (task === null) return;
    // Cached before the open row is flagged (and eventually deleted by the sync
    // flush), so the calendar's history survives the completion. It is also what
    // carries `cancelled` until the push happens.
    await this.completedDao.upsert({
      id: task.id,
      title: task.title,
      completedAtMillis: this.timeSource.now(),
      seriesId: task.seriesId,
      cancelled,
    });
    await this.dao.markPendingDone(id);
    this.scheduler.cancel(id);
    const recurrence = taskRecurrence(task);
    if (recurrence !== null) {
      await this.spawnNextOccurrence(task, recurrence);
    }
    this.syncScheduler.requestSync();
  }

  /**
   * The next occurrence's id is derived from the series and its fire time, so a
   * double-complete (or two devices completing the same occurrence) mints the
   * same id and dedupes locally and via the idempotent create.
   */
  private async spawnNextOccurrence(done: OpenTask, recurrence: Recurrence): Promise<void> {
    const anchor = done.firstWarningAtMillis ?? done.createdAtMillis;
    const nextAt = computeNextOccurrence(anchor, recurrence, this.timeSource.now());
    const seriesId = done.seriesId ?? done.id;
    const nextId = nameUuidFromBytes(`${seriesId}:${nextAt}`);
    if ((await this.dao.getById(nextId)) !== null) return;
    const next: OpenTask = {
      ...done,
      id: nextId,
      createdAtMillis: this.timeSource.now(),
      firstWarningAtMillis: nextAt,
      nextFireAtMillis: nextAt,
      seriesId,
      pendingCreate: true,
      pendingDone: false,
      pendingUpdate: false,
    };
    await this.dao.upsert(next);
    this.scheduler.schedule(next);
    // No titleDao.recordUse: spawns shouldn't inflate suggestion ranks.
  }

  /**
   * Rewrites the task's schedule: when it starts nagging, how often it re-nags,
   * and whether it recurs. Takes effect locally right away and stays flagged
   * pendingUpdate until a sync pushes it. Editing the start time of a recurring
   * task re-anchors the whole series.
   */
  async editSchedule(
    id: string,
    firstWarningAtMillis: number | null,
    repeatIntervalMinutes: number,
    recurrence: Recurrence | null,
  ): Promise<void> {
    if (repeatIntervalMinutes < 1) {
      throw new Error('repeat interval must be at least 1 minute');
    }
    if (recurrence !== null && firstWarningAtMillis === null) {
      throw new Error('a recurring task needs a first occurrence time');
    }
    const task = await this.dao.getById(id);
    if (task === null) return;
    const updated: OpenTask = {
      ...task,
      firstWarningAtMillis,
      repeatIntervalMinutes,
      recurEveryN: recurrence?.everyN ?? null,
      recurUnit: recurrence?.unit ?? null,
      recurDaysOfWeek: recurrence?.unit === 'weeks' ? recurrence.daysOfWeek : null,
      seriesId: recurrence ? (task.seriesId ?? task.id) : null,
      nextFireAtMillis: computeNextFire(
        task.createdAtMillis,
        task.initialDelayMinutes,
        repeatIntervalMinutes,
        this.timeSource.now(),
        firstWarningAtMillis,
      ),
      // Always flagged, even while pendingCreate: if a create response was lost,
      // the server already has the old values and a re-pushed create is ignored
      // idempotently — only the follow-up PUT repairs it.
      pendingUpdate: true,
    };
    await this.dao.upsert(updated);
    this.scheduler.schedule(updated);
    this.scheduler.dismissNotification(id);
    this.syncScheduler.requestSync();
  }

  /**
   * Pushes the next nag out by [minutes] from now, reschedules the alarm and
   * clears the current reminder. Purely local: the new fire time lives in the
   * local database and is preserved across syncs, so the server never needs to
   * know.
   */
  async snoozeTask(id: string, minutes: number): Promise<void> {
    await this.snoozeUntil(id, this.timeSource.now() + minutes * MINUTE_MILLIS);
  }

  /**
   * Silences the task until an exact moment picked by the user, with the same
   * local-only semantics as [snoozeTask]: the task's own schedule (start time,
   * interval, recurrence) is untouched, so this defers the nag without
   * rewriting what the task actually is. A time in the past is ignored — it
   * would fire instantly and look like the snooze did nothing.
   */
  async snoozeUntil(id: string, atMillis: number): Promise<void> {
    if (atMillis <= this.timeSource.now()) return;
    const task = await this.dao.getById(id);
    if (task === null) return;
    const next: OpenTask = { ...task, nextFireAtMillis: atMillis };
    await this.dao.upsert(next);
    this.scheduler.schedule(next);
    this.scheduler.dismissNotification(id);
  }

  /**
   * A reminder fired: show the nag and schedule the next repeat. The chain stops
   * once the task is completed (row removed or pendingDone).
   */
  async onReminderFired(id: string): Promise<void> {
    const task = await this.dao.getById(id);
    if (task === null || task.pendingDone) return;
    const session = await this.settings.current();
    this.scheduler.showReminder(
      task,
      session.waitMinutes[session.defaultWaitIndex] ?? session.waitMinutes[0],
    );
    const next: OpenTask = {
      ...task,
      nextFireAtMillis: this.timeSource.now() + task.repeatIntervalMinutes * MINUTE_MILLIS,
    };
    await this.dao.upsert(next);
    this.scheduler.schedule(next);
  }

  /**
   * Re-arms every open task's reminder after a restart. Fire times that passed
   * while the app was closed are nudged one minute out.
   */
  async reArmAlarms(): Promise<void> {
    const now = this.timeSource.now();
    for (const task of await this.dao.getActive()) {
      const next =
        task.nextFireAtMillis <= now ? { ...task, nextFireAtMillis: now + MINUTE_MILLIS } : task;
      await this.dao.upsert(next);
      this.scheduler.schedule(next);
    }
  }

  /**
   * Saves settings locally — they take effect immediately — and flags them dirty
   * until a sync pushes them (last write wins).
   */
  async updateSettings(newSettings: SettingsDto): Promise<void> {
    await this.settings.saveSettings(newSettings);
    await this.settings.markSettingsDirty();
    this.syncScheduler.requestSync();
  }

  /**
   * Points the app at a new server. Keeps the session and all local data;
   * pending work will sync to the new server.
   */
  async changeServer(baseUrl: string): Promise<void> {
    const normalized = baseUrl.trim().replace(/\/+$/, '');
    if (normalized === '') {
      throw new Error('Enter the server URL first.');
    }
    let parsed: URL;
    try {
      parsed = new URL(`${normalized}/`);
    } catch {
      throw new Error("That doesn't look like a valid http(s) URL.");
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error("That doesn't look like a valid http(s) URL.");
    }
    await this.settings.saveBaseUrl(normalized);
    this.syncScheduler.requestSync();
  }

  async titles(): Promise<string[]> {
    return this.titleDao.getRanked();
  }

  /** Hides a title from autocomplete without forgetting it, so sync can't relearn it. */
  async dismissTitle(title: string): Promise<void> {
    await this.titleDao.dismiss(title);
  }

  async restoreTitle(title: string): Promise<void> {
    await this.titleDao.restore(title);
  }

  /**
   * Push local changes, then pull server state. Each phase leaves the data
   * consistent if a later one fails: pending flags survive until their push is
   * acknowledged, and the pull never removes rows with pending changes. Network
   * errors propagate so callers (scheduler/UI) can retry or report.
   */
  async sync(): Promise<void> {
    await this.pushPendingCreates();
    await this.pushPendingUpdates();
    await this.flushPendingCompletions();
    await this.pushSettingsIfDirty();

    const remote = await this.apiClient.api().getTasks('open');
    const known = new Map((await this.dao.getAll()).map((task) => [task.id, task]));
    const entities = remote.map((dto) => {
      const local = known.get(dto.id);
      if (local === undefined) return toEntity(dto, this.timeSource.now());
      // Local pending changes win until pushed; otherwise adopt schedule edits
      // made on other devices while preserving the local nag state.
      return local.pendingCreate || local.pendingUpdate || local.pendingDone
        ? local
        : mergeServerSchedule(local, dto, this.timeSource.now());
    });
    await this.dao.upsertAll(entities);
    const remoteIds = new Set(remote.map((dto) => dto.id));
    for (const task of known.values()) {
      if (!task.pendingDone && !task.pendingCreate && !remoteIds.has(task.id)) {
        this.scheduler.cancel(task.id);
      }
    }
    await this.dao.deleteSyncedNotIn([...remoteIds]);

    // Completion history for the calendar. Append-only IGNORE: a completion
    // pushed moments ago comes straight back with the server's timestamp, but
    // the locally cached row (with the truthful local time) wins. The full
    // history is small; add a `since` param server-side if it grows.
    const done = await this.apiClient.api().getTasks('done');
    await this.completedDao.insertIgnoring(
      done
        .filter((dto): dto is TaskDto & { completedAt: string } => !!dto.completedAt)
        .map((dto) => ({
          id: dto.id,
          title: dto.title,
          completedAtMillis: parseIsoInstant(dto.completedAt),
          seriesId: dto.seriesId ?? null,
          cancelled: dto.cancelled,
        })),
    );

    await this.titleDao.upsertFromServer(
      await this.apiClient.api().getTitles(),
      this.timeSource.now(),
    );
    await this.pullSettingsIfClean();

    for (const task of await this.dao.getActive()) {
      this.scheduler.schedule(task);
    }
  }

  async signOut(): Promise<void> {
    // Best-effort flush so queued offline work isn't silently dropped.
    try {
      await this.sync();
    } catch {
      // ignored
    }
    for (const task of await this.dao.getAll()) {
      this.scheduler.cancel(task.id);
    }
    await this.dao.clear();
    await this.titleDao.clear();
    await this.completedDao.clear();
  }

  private async pushPendingCreates(): Promise<void> {
    for (const task of await this.dao.getPendingCreate()) {
      try {
        await this.apiClient.api().createTask({
          title: task.title,
          firstWarningAt:
            task.firstWarningAtMillis === null ? null : toIsoInstant(task.firstWarningAtMillis),
          id: task.id,
          createdAt: toIsoInstant(task.createdAtMillis),
          initialDelayMinutes: task.initialDelayMinutes,
          repeatIntervalMinutes: task.repeatIntervalMinutes,
          recurEveryN: task.recurEveryN,
          recurUnit: task.recurUnit,
          recurDaysOfWeek: task.recurDaysOfWeek,
          seriesId: task.seriesId,
        });
        await this.dao.clearPendingCreate(task.id);
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        if (error.status === 401) throw error;
        if (error.status === 409) {
          // Id taken by another user; give the task a fresh one and let the next
          // sync push it. Practically unreachable.
          const reborn: OpenTask = { ...task, id: randomUuid() };
          await this.dao.delete(task.id);
          this.scheduler.cancel(task.id);
          await this.dao.upsert(reborn);
          this.scheduler.schedule(reborn);
        } else if (error.status >= 400 && error.status <= 499) {
          // Other 4xx would repeat forever; drop the flag instead of wedging
          // sync. 5xx: keep the flag and retry next sync.
          await this.dao.clearPendingCreate(task.id);
        }
      }
    }
  }

  private async pushPendingUpdates(): Promise<void> {
    for (const task of await this.dao.getPendingUpdate()) {
      try {
        await this.apiClient.api().updateTaskSchedule(task.id, {
          firstWarningAt:
            task.firstWarningAtMillis === null ? null : toIsoInstant(task.firstWarningAtMillis),
          repeatIntervalMinutes: task.repeatIntervalMinutes,
          recurEveryN: task.recurEveryN,
          recurUnit: task.recurUnit,
          recurDaysOfWeek: task.recurDaysOfWeek,
          seriesId: task.seriesId,
        });
        await this.dao.clearPendingUpdate(task.id);
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        if (error.status === 401) throw error;
        // 404: gone remotely (completed/deleted elsewhere) — the edit is moot
        // and the pull will prune the row. Other 4xx would repeat forever; drop
        // the flag instead of wedging sync. 5xx: keep the flag and retry.
        if (error.status >= 400 && error.status <= 499) {
          await this.dao.clearPendingUpdate(task.id);
        }
      }
    }
  }

  private async flushPendingCompletions(): Promise<void> {
    for (const task of await this.dao.getPendingDone()) {
      try {
        // The cached completion row holds the moment the task was actually
        // completed on this device (and whether it was cancelled); without it
        // the server would stamp the completion with the sync time and record
        // it as done.
        const cached = await this.completedDao.getById(task.id);
        await this.apiClient.api().completeTask(task.id, {
          completedAt: cached ? toIsoInstant(cached.completedAtMillis) : null,
          cancelled: cached?.cancelled ?? false,
        });
        await this.dao.delete(task.id);
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        if (error.status === 401) throw error;
        // Gone on the server already; stop retrying.
        if (error.status === 404) await this.dao.delete(task.id);
      }
    }
  }

  private async pushSettingsIfDirty(): Promise<void> {
    if (!(await this.settings.isSettingsDirty())) return;
    const session = await this.settings.current();
    await this.apiClient.api().updateSettings({
      initialDelayMinutes: session.initialDelayMinutes,
      repeatIntervalMinutes: session.repeatIntervalMinutes,
      waitMinutes: session.waitMinutes,
      defaultWaitIndex: session.defaultWaitIndex,
      quietHours: session.quietHours,
    });
    await this.settings.clearSettingsDirty();
  }

  private async pullSettingsIfClean(): Promise<void> {
    if (await this.settings.isSettingsDirty()) return;
    await this.settings.saveSettings(await this.apiClient.api().getSettings());
  }
}

export function toEntity(dto: TaskDto, nowMillis: number): OpenTask {
  const createdAtMillis = parseIsoInstant(dto.createdAt);
  const firstWarningAtMillis = dto.firstWarningAt ? parseIsoInstant(dto.firstWarningAt) : null;
  return {
    id: dto.id,
    title: dto.title,
    createdAtMillis,
    initialDelayMinutes: dto.initialDelayMinutes,
    repeatIntervalMinutes: dto.repeatIntervalMinutes,
    firstWarningAtMillis,
    nextFireAtMillis: computeNextFire(
      createdAtMillis,
      dto.initialDelayMinutes,
      dto.repeatIntervalMinutes,
      nowMillis,
      firstWarningAtMillis,
    ),
    recurEveryN: dto.recurEveryN ?? null,
    recurUnit: dto.recurUnit ?? null,
    recurDaysOfWeek: dto.recurDaysOfWeek ?? null,
    seriesId: dto.seriesId ?? null,
    pendingDone: false,
    pendingCreate: false,
    pendingUpdate: false,
  };
}

/**
 * Adopts the server's schedule (start time, nag interval, recurrence) into a
 * local row with no pending changes. The live fire time is only recomputed when
 * the schedule actually changed — an unchanged pull must not clobber a local
 * snooze.
 */
export function mergeServerSchedule(task: OpenTask, dto: TaskDto, nowMillis: number): OpenTask {
  const dtoFirstWarningAtMillis = dto.firstWarningAt ? parseIsoInstant(dto.firstWarningAt) : null;
  const scheduleChanged =
    dtoFirstWarningAtMillis !== task.firstWarningAtMillis ||
    dto.repeatIntervalMinutes !== task.repeatIntervalMinutes;
  return {
    ...task,
    firstWarningAtMillis: dtoFirstWarningAtMillis,
    repeatIntervalMinutes: dto.repeatIntervalMinutes,
    recurEveryN: dto.recurEveryN ?? null,
    recurUnit: dto.recurUnit ?? null,
    recurDaysOfWeek: dto.recurDaysOfWeek ?? null,
    seriesId: dto.seriesId ?? null,
    nextFireAtMillis: scheduleChanged
      ? computeNextFire(
          task.createdAtMillis,
          task.initialDelayMinutes,
          dto.repeatIntervalMinutes,
          nowMillis,
          dtoFirstWarningAtMillis,
        )
      : task.nextFireAtMillis,
  };
}

/** Re-exported so callers don't need to know which module defines them. */
export { NetworkError, ApiError };
