import {
  ApiProvider,
  BadgerApi,
  CompleteTaskRequest,
  CreateTaskRequest,
  LoginRequest,
  LoginResponse,
  TaskDto,
  TaskStatus,
  UpdateTaskScheduleRequest,
} from '../data/api';
import { Clock } from '../data/clock';
import { SettingsStore } from '../data/session-store';
import { ApiError, NetworkError } from '../domain/errors';
import { OpenTask, Session, SettingsDto } from '../domain/models';
import { toIsoInstant } from '../domain/time';
import { randomUuid } from '../domain/uuid';
import { ReminderScheduler } from '../notify/reminder-scheduler';
import { SyncScheduler } from '../sync/sync-scheduler';

/**
 * In-memory stand-in for the backend, mirroring its behavior: per-id idempotent
 * creates, 404 on completing unknown tasks, titles ordered by frequency.
 * `online = false` makes every call fail like a dead network.
 */
export class FakeBadgerApi implements BadgerApi, ApiProvider {
  online = true;
  unauthorized = false;

  /** Server stores the task but the response never reaches the client. */
  dropCreateResponses = false;
  failCreatesWithServerError = false;
  failTaskPull = false;
  failSettingsPush = false;

  settings: SettingsDto = {
    initialDelayMinutes: 60,
    repeatIntervalMinutes: 15,
    waitMinutes: [60, 240],
    defaultWaitIndex: 0,
    quietHours: [],
  };
  readonly tasks = new Map<string, TaskDto>();

  readonly receivedCreates: CreateTaskRequest[] = [];
  readonly receivedCompletions: string[] = [];
  readonly receivedSettingsPuts: SettingsDto[] = [];
  readonly receivedScheduleUpdates: [string, UpdateTaskScheduleRequest][] = [];

  constructor(private readonly clock: Clock) {}

  api(): BadgerApi {
    return this;
  }

  openTasks(): TaskDto[] {
    return [...this.tasks.values()].filter((task) => !task.completedAt);
  }

  doneTasks(): TaskDto[] {
    return [...this.tasks.values()].filter((task) => !!task.completedAt);
  }

  /** A completion that happened elsewhere (e.g. on another device). */
  seedCompletedTask(options: {
    title: string;
    completedAtMillis: number;
    id?: string;
    createdAtMillis?: number;
    seriesId?: string | null;
    cancelled?: boolean;
  }): TaskDto {
    const id = options.id ?? randomUuid();
    const open = this.seedOpenTask({
      title: options.title,
      id,
      createdAtMillis: options.createdAtMillis ?? options.completedAtMillis,
      seriesId: options.seriesId ?? null,
    });
    const dto: TaskDto = {
      ...open,
      completedAt: toIsoInstant(options.completedAtMillis),
      cancelled: options.cancelled ?? false,
    };
    this.tasks.set(id, dto);
    return dto;
  }

  seedOpenTask(options: {
    title: string;
    id?: string;
    createdAtMillis?: number;
    initialDelayMinutes?: number;
    repeatIntervalMinutes?: number;
    firstWarningAtMillis?: number | null;
    recurEveryN?: number | null;
    recurUnit?: string | null;
    recurDaysOfWeek?: number | null;
    seriesId?: string | null;
  }): TaskDto {
    const id = options.id ?? randomUuid();
    const dto: TaskDto = {
      id,
      title: options.title,
      createdAt: toIsoInstant(options.createdAtMillis ?? this.clock.now()),
      completedAt: null,
      initialDelayMinutes: options.initialDelayMinutes ?? this.settings.initialDelayMinutes,
      repeatIntervalMinutes: options.repeatIntervalMinutes ?? this.settings.repeatIntervalMinutes,
      firstWarningAt:
        options.firstWarningAtMillis === null || options.firstWarningAtMillis === undefined
          ? null
          : toIsoInstant(options.firstWarningAtMillis),
      recurEveryN: options.recurEveryN ?? null,
      recurUnit: options.recurUnit ?? null,
      recurDaysOfWeek: options.recurDaysOfWeek ?? null,
      seriesId: options.seriesId ?? null,
      cancelled: false,
    };
    this.tasks.set(id, dto);
    return dto;
  }

  private gate(): void {
    if (!this.online) throw new NetworkError('offline');
    if (this.unauthorized) throw new ApiError(401);
  }

  async login(_request: LoginRequest): Promise<LoginResponse> {
    throw new Error('not exercised by repository scenarios');
  }

  async getSettings(): Promise<SettingsDto> {
    this.gate();
    return this.settings;
  }

  async updateSettings(settings: SettingsDto): Promise<SettingsDto> {
    this.gate();
    if (this.failSettingsPush) throw new ApiError(500);
    this.receivedSettingsPuts.push(settings);
    this.settings = settings;
    return settings;
  }

  async getTasks(status: TaskStatus): Promise<TaskDto[]> {
    this.gate();
    if (this.failTaskPull) throw new NetworkError('connection dropped mid-sync');
    return status === 'done' ? this.doneTasks() : this.openTasks();
  }

  async createTask(request: CreateTaskRequest): Promise<TaskDto> {
    this.gate();
    if (this.failCreatesWithServerError) throw new ApiError(500);
    this.receivedCreates.push(request);
    if (request.id) {
      const existing = this.tasks.get(request.id);
      if (existing) return existing; // idempotent retry
    }
    const dto: TaskDto = {
      id: request.id ?? randomUuid(),
      title: request.title.trim(),
      createdAt: request.createdAt ?? toIsoInstant(this.clock.now()),
      completedAt: null,
      initialDelayMinutes: request.initialDelayMinutes ?? this.settings.initialDelayMinutes,
      repeatIntervalMinutes: request.repeatIntervalMinutes ?? this.settings.repeatIntervalMinutes,
      firstWarningAt: request.firstWarningAt ?? null,
      recurEveryN: request.recurEveryN ?? null,
      recurUnit: request.recurUnit ?? null,
      recurDaysOfWeek: request.recurDaysOfWeek ?? null,
      seriesId: request.seriesId ?? null,
      cancelled: false,
    };
    this.tasks.set(dto.id, dto);
    if (this.dropCreateResponses) throw new NetworkError('response lost');
    return dto;
  }

  async updateTaskSchedule(id: string, request: UpdateTaskScheduleRequest): Promise<TaskDto> {
    this.gate();
    const task = this.tasks.get(id);
    if (!task) throw new ApiError(404);
    this.receivedScheduleUpdates.push([id, request]);
    const updated: TaskDto = {
      ...task,
      firstWarningAt: request.firstWarningAt,
      repeatIntervalMinutes: request.repeatIntervalMinutes,
      recurEveryN: request.recurEveryN,
      recurUnit: request.recurUnit,
      recurDaysOfWeek: request.recurDaysOfWeek,
      seriesId: request.seriesId,
    };
    this.tasks.set(id, updated);
    return updated;
  }

  async completeTask(id: string, request: CompleteTaskRequest): Promise<TaskDto> {
    this.gate();
    const task = this.tasks.get(id);
    if (!task) throw new ApiError(404);
    this.receivedCompletions.push(id);
    // Mirrors the server: a re-pushed close neither moves the time nor rewrites
    // how the task was closed.
    if (task.completedAt) return task;
    const done: TaskDto = {
      ...task,
      completedAt: request.completedAt ?? toIsoInstant(this.clock.now()),
      cancelled: request.cancelled,
    };
    this.tasks.set(id, done);
    return done;
  }

  async getTitles(): Promise<string[]> {
    this.gate();
    const byTitle = new Map<string, TaskDto[]>();
    for (const task of this.tasks.values()) {
      const bucket = byTitle.get(task.title);
      if (bucket) bucket.push(task);
      else byTitle.set(task.title, [task]);
    }
    return [...byTitle.entries()]
      .sort(
        (a, b) =>
          b[1].length - a[1].length ||
          compare(
            b[1].reduce((max, t) => (t.createdAt > max ? t.createdAt : max), ''),
            a[1].reduce((max, t) => (t.createdAt > max ? t.createdAt : max), ''),
          ),
      )
      .map(([title]) => title);
  }
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export class MutableClock implements Clock {
  constructor(public nowMillis: number) {}

  now(): number {
    return this.nowMillis;
  }

  advanceMinutes(minutes: number): void {
    this.nowMillis += minutes * 60_000;
  }
}

export interface ShownReminder {
  readonly task: OpenTask;
  readonly defaultWaitMinutes: number;
}

export class RecordingReminderScheduler implements ReminderScheduler {
  /** taskId -> fire time of the currently armed reminder. */
  readonly scheduled = new Map<string, number>();
  readonly cancelled: string[] = [];
  readonly dismissed: string[] = [];
  readonly shownReminders: ShownReminder[] = [];

  schedule(task: OpenTask): void {
    this.scheduled.set(task.id, task.nextFireAtMillis);
  }

  cancel(taskId: string): void {
    this.scheduled.delete(taskId);
    this.cancelled.push(taskId);
  }

  dismissNotification(taskId: string): void {
    this.dismissed.push(taskId);
  }

  showReminder(task: OpenTask, defaultWaitMinutes: number): void {
    this.shownReminders.push({ task, defaultWaitMinutes });
  }
}

export class RecordingSyncScheduler implements SyncScheduler {
  requests = 0;

  requestSync(): void {
    this.requests++;
  }
}

export class FakeSettingsStore implements SettingsStore {
  settings: SettingsDto = {
    initialDelayMinutes: 60,
    repeatIntervalMinutes: 15,
    waitMinutes: [60, 240],
    defaultWaitIndex: 0,
    quietHours: [],
  };
  dirty = false;
  baseUrl = 'http://badger.test';

  async current(): Promise<Session> {
    return {
      baseUrl: this.baseUrl,
      token: 'test-jwt',
      email: 'test@example.com',
      initialDelayMinutes: this.settings.initialDelayMinutes,
      repeatIntervalMinutes: this.settings.repeatIntervalMinutes,
      waitMinutes: this.settings.waitMinutes,
      defaultWaitIndex: this.settings.defaultWaitIndex,
      quietHours: this.settings.quietHours,
      settingsDirty: this.dirty,
    };
  }

  async saveBaseUrl(baseUrl: string): Promise<void> {
    this.baseUrl = baseUrl;
  }

  async saveSettings(settings: SettingsDto): Promise<void> {
    this.settings = settings;
  }

  async markSettingsDirty(): Promise<void> {
    this.dirty = true;
  }

  async clearSettingsDirty(): Promise<void> {
    this.dirty = false;
  }

  async isSettingsDirty(): Promise<boolean> {
    return this.dirty;
  }
}
