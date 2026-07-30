import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { ApiError, NetworkError } from '../domain/errors';
import { SettingsDto } from '../domain/models';
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
} from './api';

/** Matches the OkHttp read timeout the Android client uses. */
const REQUEST_TIMEOUT_MILLIS = 20_000;

/**
 * The API over HttpClient. Paths are relative; the auth interceptor prefixes
 * the session's base URL and attaches the bearer token, which is Retrofit's
 * job on the other client.
 */
export class HttpBadgerApi implements BadgerApi, ApiProvider {
  constructor(private readonly http: HttpClient) {}

  api(): BadgerApi {
    return this;
  }

  login(request: LoginRequest): Promise<LoginResponse> {
    return this.send(this.http.post<LoginResponse>('auth/google', request));
  }

  getSettings(): Promise<SettingsDto> {
    return this.send(this.http.get<SettingsDto>('me/settings'));
  }

  updateSettings(settings: SettingsDto): Promise<SettingsDto> {
    return this.send(this.http.put<SettingsDto>('me/settings', settings));
  }

  getTasks(status: TaskStatus): Promise<TaskDto[]> {
    return this.send(
      this.http.get<TaskDto[]>('tasks', { params: new HttpParams().set('status', status) }),
    );
  }

  createTask(request: CreateTaskRequest): Promise<TaskDto> {
    return this.send(this.http.post<TaskDto>('tasks', request));
  }

  updateTaskSchedule(id: string, request: UpdateTaskScheduleRequest): Promise<TaskDto> {
    return this.send(this.http.put<TaskDto>(`tasks/${encodeURIComponent(id)}/schedule`, request));
  }

  completeTask(id: string, request: CompleteTaskRequest): Promise<TaskDto> {
    return this.send(this.http.post<TaskDto>(`tasks/${encodeURIComponent(id)}/complete`, request));
  }

  getTitles(): Promise<string[]> {
    return this.send(this.http.get<string[]>('tasks/titles'));
  }

  private async send<T>(request$: import('rxjs').Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(request$.pipe(timeout(REQUEST_TIMEOUT_MILLIS)));
    } catch (error) {
      throw toBadgerError(error);
    }
  }
}

/**
 * A request that never reached the server (DNS, refused, CORS, timeout) reports
 * status 0; anything else carries the server's status. The repository branches
 * on exactly this distinction, so it has to happen at the edge.
 */
export function toBadgerError(error: unknown): unknown {
  if (error instanceof HttpErrorResponse) {
    return error.status === 0 ? new NetworkError(error.message) : new ApiError(error.status);
  }
  if (error instanceof Error && error.name === 'TimeoutError') {
    return new NetworkError('The server took too long to answer.');
  }
  return error;
}
