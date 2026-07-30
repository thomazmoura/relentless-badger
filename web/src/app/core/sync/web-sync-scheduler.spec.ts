import { ApiError, NetworkError } from '../domain/errors';
import {
  BACKOFF_START_MILLIS,
  PERIODIC_INTERVAL_MILLIS,
  SyncEnvironment,
  WebSyncScheduler,
} from './web-sync-scheduler';

/**
 * The web counterpart of WorkSchedulingScenarios.kt: WorkManager's CONNECTED
 * constraint and its periodic safety net are features, not wiring, so their
 * replacements are tested the same way.
 */
describe('WebSyncScheduler', () => {
  let online: boolean;
  let timers: { id: number; callback: () => void; delay: number }[];
  let nextTimerId: number;
  let env: SyncEnvironment;

  beforeEach(() => {
    online = true;
    timers = [];
    nextTimerId = 1;
    env = {
      isOnline: () => online,
      setTimer: (callback, delay) => {
        const id = nextTimerId++;
        timers.push({ id, callback, delay });
        return id;
      },
      clearTimer: (handle) => {
        timers = timers.filter((timer) => timer.id !== handle);
      },
    };
  });

  const fireTimers = () => {
    const due = timers;
    timers = [];
    for (const timer of due) timer.callback();
  };

  it('runs a requested sync right away when online', async () => {
    const scheduler = new WebSyncScheduler(env);
    let runs = 0;
    scheduler.attach(async () => {
      runs++;
    });

    scheduler.requestSync();
    await Promise.resolve();

    expect(runs).toBe(1);
  });

  it('holds a request made while offline and runs it when connectivity returns', async () => {
    const scheduler = new WebSyncScheduler(env);
    let runs = 0;
    scheduler.attach(async () => {
      runs++;
    });

    online = false;
    scheduler.requestSync();
    await Promise.resolve();
    expect(runs, 'nothing pushed while offline').toBe(0);

    online = true;
    scheduler.onConnectivityOrFocus();
    await Promise.resolve();

    expect(runs).toBe(1);
  });

  it('queues exactly one more pass for requests made during a sync', async () => {
    const scheduler = new WebSyncScheduler(env);
    let runs = 0;
    let release: (() => void) | null = null;
    scheduler.attach(async () => {
      runs++;
      await new Promise<void>((resolve) => (release = resolve));
    });

    scheduler.requestSync();
    await Promise.resolve();
    expect(runs).toBe(1);

    scheduler.requestSync();
    scheduler.requestSync();
    release!();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(runs, 'two extra requests collapse into one follow-up pass').toBe(2);
  });

  it('retries a failed sync with backoff', async () => {
    const scheduler = new WebSyncScheduler(env);
    let runs = 0;
    scheduler.attach(async () => {
      runs++;
      if (runs === 1) throw new NetworkError();
    });

    await scheduler.flush().catch(() => undefined);
    expect(timers.length, 'a retry is armed').toBe(1);
    expect(timers[0].delay).toBe(BACKOFF_START_MILLIS);

    fireTimers();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(runs).toBe(2);
    expect(timers, 'no retry armed after success').toEqual([]);
  });

  it('does not retry a rejected session — only signing in again can fix it', async () => {
    const scheduler = new WebSyncScheduler(env);
    scheduler.attach(async () => {
      throw new ApiError(401);
    });

    await scheduler.flush().catch(() => undefined);

    expect(timers).toEqual([]);
    expect(scheduler.lastError()).toBeInstanceOf(ApiError);
  });

  it('registers the periodic safety net once', () => {
    const scheduler = new WebSyncScheduler(env);
    scheduler.attach(async () => undefined);

    scheduler.ensurePeriodic();
    scheduler.ensurePeriodic(); // idempotent

    expect(timers.length).toBe(1);
    expect(timers[0].delay).toBe(PERIODIC_INTERVAL_MILLIS);
  });

  it('stays put while signed out', async () => {
    const scheduler = new WebSyncScheduler(env);
    let runs = 0;
    scheduler.attach(
      async () => {
        runs++;
      },
      () => false,
    );

    scheduler.requestSync();
    await Promise.resolve();

    expect(runs).toBe(0);
  });
});
