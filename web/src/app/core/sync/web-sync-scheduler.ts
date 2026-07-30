import { signal } from '@angular/core';
import { ApiError } from '../domain/errors';
import { SyncScheduler } from './sync-scheduler';

/**
 * The web's WorkManager: coalesces sync requests, waits for connectivity, and
 * retries with backoff.
 *
 * WorkManager's CONNECTED constraint is the "push as soon as connectivity
 * returns" feature, so it is reproduced literally here — a request made while
 * offline is remembered and run on the `online` event rather than failing.
 */

export const BACKOFF_START_MILLIS = 30_000;
export const BACKOFF_CEILING_MILLIS = 30 * 60_000;
/** The periodic safety-net pull, matching the Android job's 6 hours. */
export const PERIODIC_INTERVAL_MILLIS = 6 * 60 * 60_000;

export interface SyncEnvironment {
  isOnline(): boolean;
  setTimer(callback: () => void, delayMillis: number): number;
  clearTimer(handle: number): void;
}

export const BROWSER_SYNC_ENVIRONMENT: SyncEnvironment = {
  isOnline: () => navigator.onLine,
  setTimer: (callback, delay) => setTimeout(callback, delay) as unknown as number,
  clearTimer: (handle) => clearTimeout(handle),
};

export class WebSyncScheduler implements SyncScheduler {
  /** True while a sync is in flight, for the UI's spinner. */
  readonly syncing = signal(false);
  /** Last failure, or null. The UI decides whether to surface it. */
  readonly lastError = signal<unknown>(null);

  private run: (() => Promise<void>) | null = null;
  private enabled: () => boolean = () => true;
  private queued = false;
  private backoffMillis = BACKOFF_START_MILLIS;
  private retryHandle: number | null = null;
  private periodicHandle: number | null = null;

  constructor(private readonly env: SyncEnvironment = BROWSER_SYNC_ENVIRONMENT) {}

  /**
   * Wires the actual sync. Separate from the constructor because the repository
   * needs a scheduler to be built, and the scheduler needs the repository.
   */
  attach(run: () => Promise<void>, enabled: () => boolean = () => true): void {
    this.run = run;
    this.enabled = enabled;
  }

  requestSync(): void {
    if (this.syncing()) {
      // Android's APPEND_OR_REPLACE: a request during a running sync queues
      // exactly one more pass, so late changes still get pushed.
      this.queued = true;
      return;
    }
    if (!this.env.isOnline()) {
      this.queued = true; // the CONNECTED constraint: run when the network is back
      return;
    }
    void this.flush();
  }

  /** The 6-hour safety net, registered once. */
  ensurePeriodic(): void {
    if (this.periodicHandle !== null) return;
    const tick = () => {
      this.periodicHandle = this.env.setTimer(tick, PERIODIC_INTERVAL_MILLIS);
      this.requestSync();
    };
    this.periodicHandle = this.env.setTimer(tick, PERIODIC_INTERVAL_MILLIS);
  }

  /** Connectivity came back, or the user returned to the tab. */
  onConnectivityOrFocus(): void {
    if (this.queued || this.retryHandle !== null) {
      this.cancelRetry();
      this.requestSync();
    }
  }

  async flush(): Promise<void> {
    if (this.run === null || !this.enabled() || this.syncing()) return;
    this.cancelRetry();
    this.queued = false;
    this.syncing.set(true);
    try {
      await this.run();
      this.lastError.set(null);
      this.backoffMillis = BACKOFF_START_MILLIS;
    } catch (error) {
      this.lastError.set(error);
      // A rejected session will keep being rejected; nothing to retry until the
      // user signs in again. Anything else gets exponential backoff.
      if (!(error instanceof ApiError && error.status === 401)) {
        this.scheduleRetry();
      }
      throw error;
    } finally {
      this.syncing.set(false);
      if (this.queued && this.env.isOnline()) {
        this.queued = false;
        void this.flush().catch(() => undefined);
      }
    }
  }

  dispose(): void {
    this.cancelRetry();
    if (this.periodicHandle !== null) {
      this.env.clearTimer(this.periodicHandle);
      this.periodicHandle = null;
    }
  }

  private scheduleRetry(): void {
    const delay = this.backoffMillis;
    this.backoffMillis = Math.min(this.backoffMillis * 2, BACKOFF_CEILING_MILLIS);
    this.retryHandle = this.env.setTimer(() => {
      this.retryHandle = null;
      void this.flush().catch(() => undefined);
    }, delay);
  }

  private cancelRetry(): void {
    if (this.retryHandle !== null) {
      this.env.clearTimer(this.retryHandle);
      this.retryHandle = null;
    }
  }
}
