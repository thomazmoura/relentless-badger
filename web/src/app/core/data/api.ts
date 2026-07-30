import { SettingsDto } from '../domain/models';

/**
 * The wire contract, shared with the Android client. All timestamps are
 * ISO-8601 UTC strings.
 */

export interface LoginRequest {
  readonly idToken: string;
}

export interface LoginResponse {
  readonly token: string;
  readonly email: string;
  readonly name?: string | null;
  readonly settings: SettingsDto;
}

export interface CreateTaskRequest {
  readonly title: string;
  readonly firstWarningAt?: string | null;
  // Set when pushing a task created here: the client-minted id makes the push
  // idempotent, the rest preserves the original creation time and the settings
  // snapshot the task was created under.
  readonly id?: string | null;
  readonly createdAt?: string | null;
  readonly initialDelayMinutes?: number | null;
  readonly repeatIntervalMinutes?: number | null;
  // Recurrence rule; recurDaysOfWeek is a bitmask (bit 0 = Monday .. bit 6 =
  // Sunday) used only when recurUnit is "weeks". The server just stores it.
  readonly recurEveryN?: number | null;
  readonly recurUnit?: string | null;
  readonly recurDaysOfWeek?: number | null;
  readonly seriesId?: string | null;
}

/**
 * Carries when the task was actually completed on the device, so a completion
 * flushed by a later sync keeps its true time; null means "now". cancelled
 * closes the task without crediting it as done.
 */
export interface CompleteTaskRequest {
  readonly completedAt?: string | null;
  readonly cancelled: boolean;
}

/** Full-state schedule update: null on a nullable field means "clear it". */
export interface UpdateTaskScheduleRequest {
  readonly firstWarningAt: string | null;
  readonly repeatIntervalMinutes: number;
  readonly recurEveryN: number | null;
  readonly recurUnit: string | null;
  readonly recurDaysOfWeek: number | null;
  readonly seriesId: string | null;
}

export interface TaskDto {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly completedAt?: string | null;
  readonly initialDelayMinutes: number;
  readonly repeatIntervalMinutes: number;
  readonly firstWarningAt?: string | null;
  readonly recurEveryN?: number | null;
  readonly recurUnit?: string | null;
  readonly recurDaysOfWeek?: number | null;
  readonly seriesId?: string | null;
  /** Only meaningful with completedAt set: the task was closed, not done. */
  readonly cancelled: boolean;
}

export type TaskStatus = 'open' | 'done' | 'all';

export interface BadgerApi {
  login(request: LoginRequest): Promise<LoginResponse>;
  getSettings(): Promise<SettingsDto>;
  updateSettings(settings: SettingsDto): Promise<SettingsDto>;
  getTasks(status: TaskStatus): Promise<TaskDto[]>;
  createTask(request: CreateTaskRequest): Promise<TaskDto>;
  updateTaskSchedule(id: string, request: UpdateTaskScheduleRequest): Promise<TaskDto>;
  completeTask(id: string, request: CompleteTaskRequest): Promise<TaskDto>;
  getTitles(): Promise<string[]>;
}

/** Indirection so the base URL can change without rebuilding the repository. */
export interface ApiProvider {
  api(): BadgerApi;
}
