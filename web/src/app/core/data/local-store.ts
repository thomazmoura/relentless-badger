import { signal, Signal, WritableSignal } from '@angular/core';
import {
  CompletedTask,
  DEFAULT_INITIAL_DELAY_MINUTES,
  DEFAULT_REPEAT_INTERVAL_MINUTES,
  DEFAULT_WAIT_MINUTES,
  OpenTask,
  Session,
  TitleHistory,
} from '../domain/models';
import { isQuotaExceeded, StorageDriver } from './storage';

/**
 * The database. Room's job, done with five localStorage keys.
 *
 * Reads never touch storage: every key is parsed once into an in-memory index
 * and published as a signal. Writes mutate the index, publish, and flush the
 * touched keys on a microtask, so mutations made in one synchronous batch
 * (a sync's upsertAll, a row rewritten field by field) cost a single
 * setItem per key — which matters because setItem is synchronous and blocks
 * the main thread.
 */

export const SCHEMA_VERSION = 1;

export const KEYS = {
  version: 'badger.v',
  openTasks: 'badger.openTasks',
  completedTasks: 'badger.completedTasks',
  titles: 'badger.titles',
  session: 'badger.session',
  ui: 'badger.ui',
} as const;

export type StoreKey = keyof typeof KEYS;

/** View state that belongs to this device, never to the server. */
export interface UiState {
  readonly tab: number;
  readonly showCancelledInCalendar: boolean;
}

export const EMPTY_SESSION: Session = {
  baseUrl: '',
  token: null,
  email: null,
  initialDelayMinutes: DEFAULT_INITIAL_DELAY_MINUTES,
  repeatIntervalMinutes: DEFAULT_REPEAT_INTERVAL_MINUTES,
  waitMinutes: [...DEFAULT_WAIT_MINUTES],
  defaultWaitIndex: 0,
  quietHours: [],
  settingsDirty: false,
};

const EMPTY_UI: UiState = { tab: 0, showCancelledInCalendar: false };

/** Completion history beyond this is pruned when storage runs out; the server still has it. */
const HISTORY_RETENTION_MILLIS = 24 * 30 * 24 * 60 * 60 * 1000;

/**
 * Schema migrations, the localStorage counterpart of BadgerDb's MIGRATION_*.
 * Each entry upgrades the raw stored strings from version N to N + 1. Version 0
 * means "nothing stored yet or written before versioning existed".
 */
const MIGRATIONS: Record<number, (driver: StorageDriver) => void> = {
  // 0 -> 1: the first versioned schema. Anything already present was written by
  // this same shape during development, so there is nothing to rewrite.
};

export class BadgerStore {
  private readonly open = new Map<string, OpenTask>();
  private readonly completed = new Map<string, CompletedTask>();
  private readonly titleRows = new Map<string, TitleHistory>();
  private session: Session = EMPTY_SESSION;
  private ui: UiState = EMPTY_UI;

  private readonly dirty = new Set<StoreKey>();
  private flushScheduled = false;

  private readonly openSignal: WritableSignal<OpenTask[]> = signal([]);
  private readonly completedSignal: WritableSignal<CompletedTask[]> = signal([]);
  private readonly titlesSignal: WritableSignal<TitleHistory[]> = signal([]);
  private readonly sessionSignal: WritableSignal<Session> = signal(EMPTY_SESSION);
  private readonly uiSignal: WritableSignal<UiState> = signal(EMPTY_UI);

  constructor(private readonly driver: StorageDriver) {
    this.migrate();
    this.reloadAll();
  }

  // --- reads ---------------------------------------------------------------

  readonly openTasks: Signal<OpenTask[]> = this.openSignal.asReadonly();
  readonly completedTasks: Signal<CompletedTask[]> = this.completedSignal.asReadonly();
  readonly titles: Signal<TitleHistory[]> = this.titlesSignal.asReadonly();
  readonly sessionState: Signal<Session> = this.sessionSignal.asReadonly();
  readonly uiState: Signal<UiState> = this.uiSignal.asReadonly();

  openTaskMap(): ReadonlyMap<string, OpenTask> {
    return this.open;
  }

  completedTaskMap(): ReadonlyMap<string, CompletedTask> {
    return this.completed;
  }

  titleMap(): ReadonlyMap<string, TitleHistory> {
    return this.titleRows;
  }

  currentSession(): Session {
    return this.session;
  }

  currentUi(): UiState {
    return this.ui;
  }

  // --- writes --------------------------------------------------------------

  mutateOpenTasks(mutator: (rows: Map<string, OpenTask>) => void): void {
    mutator(this.open);
    this.openSignal.set([...this.open.values()]);
    this.markDirty('openTasks');
  }

  mutateCompletedTasks(mutator: (rows: Map<string, CompletedTask>) => void): void {
    mutator(this.completed);
    this.completedSignal.set([...this.completed.values()]);
    this.markDirty('completedTasks');
  }

  mutateTitles(mutator: (rows: Map<string, TitleHistory>) => void): void {
    mutator(this.titleRows);
    this.titlesSignal.set([...this.titleRows.values()]);
    this.markDirty('titles');
  }

  patchSession(patch: Partial<Session>): void {
    this.session = { ...this.session, ...patch };
    this.sessionSignal.set(this.session);
    this.markDirty('session');
  }

  patchUi(patch: Partial<UiState>): void {
    this.ui = { ...this.ui, ...patch };
    this.uiSignal.set(this.ui);
    this.markDirty('ui');
  }

  /** Signing out drops everything, including the session. */
  clearAll(): void {
    this.mutateOpenTasks((rows) => rows.clear());
    this.mutateCompletedTasks((rows) => rows.clear());
    this.mutateTitles((rows) => rows.clear());
    this.session = EMPTY_SESSION;
    this.sessionSignal.set(this.session);
    this.markDirty('session');
    this.flush();
  }

  private markDirty(key: StoreKey): void {
    this.dirty.add(key);
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    queueMicrotask(() => this.flush());
  }

  /** Writes every pending key. Called automatically; exposed for tests and unload. */
  flush(): void {
    this.flushScheduled = false;
    if (this.dirty.size === 0) return;
    const keys = [...this.dirty];
    this.dirty.clear();
    try {
      for (const key of keys) {
        this.driver.setItem(KEYS[key], JSON.stringify(this.snapshot(key)));
      }
    } catch (error) {
      if (!isQuotaExceeded(error)) throw error;
      // Completion history is the only unbounded table and the server keeps the
      // authoritative copy, so old entries are the safe thing to drop.
      this.pruneHistory();
      for (const key of keys) {
        this.driver.setItem(KEYS[key], JSON.stringify(this.snapshot(key)));
      }
    }
  }

  private pruneHistory(): void {
    const cutoff = Date.now() - HISTORY_RETENTION_MILLIS;
    for (const [id, row] of this.completed) {
      if (row.completedAtMillis < cutoff) this.completed.delete(id);
    }
    this.completedSignal.set([...this.completed.values()]);
    this.driver.setItem(KEYS.completedTasks, JSON.stringify([...this.completed.values()]));
  }

  private snapshot(key: StoreKey): unknown {
    switch (key) {
      case 'openTasks':
        return [...this.open.values()];
      case 'completedTasks':
        return [...this.completed.values()];
      case 'titles':
        return [...this.titleRows.values()];
      case 'session':
        return this.session;
      case 'ui':
        return this.ui;
      case 'version':
        return SCHEMA_VERSION;
    }
  }

  // --- loading -------------------------------------------------------------

  private migrate(): void {
    const stored = Number(this.driver.getItem(KEYS.version) ?? 0);
    const from = Number.isFinite(stored) ? stored : 0;
    for (let v = from; v < SCHEMA_VERSION; v++) {
      MIGRATIONS[v]?.(this.driver);
    }
    if (from !== SCHEMA_VERSION) {
      this.driver.setItem(KEYS.version, String(SCHEMA_VERSION));
    }
  }

  private reloadAll(): void {
    this.reload('openTasks');
    this.reload('completedTasks');
    this.reload('titles');
    this.reload('session');
    this.reload('ui');
  }

  /**
   * Re-parses one key from storage. Also the multi-tab reconciliation path: a
   * `storage` event names the key another tab rewrote.
   */
  reload(key: StoreKey): void {
    switch (key) {
      case 'openTasks': {
        const rows = this.readArray<OpenTask>(KEYS.openTasks);
        this.open.clear();
        for (const row of rows) this.open.set(row.id, normalizeOpenTask(row));
        this.openSignal.set([...this.open.values()]);
        break;
      }
      case 'completedTasks': {
        const rows = this.readArray<CompletedTask>(KEYS.completedTasks);
        this.completed.clear();
        for (const row of rows) this.completed.set(row.id, row);
        this.completedSignal.set([...this.completed.values()]);
        break;
      }
      case 'titles': {
        const rows = this.readArray<TitleHistory>(KEYS.titles);
        this.titleRows.clear();
        for (const row of rows) this.titleRows.set(row.title, row);
        this.titlesSignal.set([...this.titleRows.values()]);
        break;
      }
      case 'session': {
        const stored = this.readObject<Partial<Session>>(KEYS.session);
        this.session = { ...EMPTY_SESSION, ...(stored ?? {}) };
        this.sessionSignal.set(this.session);
        break;
      }
      case 'ui': {
        const stored = this.readObject<Partial<UiState>>(KEYS.ui);
        this.ui = { ...EMPTY_UI, ...(stored ?? {}) };
        this.uiSignal.set(this.ui);
        break;
      }
      case 'version':
        break;
    }
  }

  /** Maps a storage key name back to the logical key, or null if it isn't ours. */
  static storeKeyFor(storageKey: string | null): StoreKey | null {
    const found = (Object.keys(KEYS) as StoreKey[]).find((key) => KEYS[key] === storageKey);
    return found ?? null;
  }

  // A corrupt value (a half-written key, a hand-edited devtools entry) must not
  // brick the app: fall back to empty and let sync repopulate from the server.
  private readArray<T>(key: string): T[] {
    const parsed = this.parse(key);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  }

  private readObject<T>(key: string): T | null {
    const parsed = this.parse(key);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as T)
      : null;
  }

  private parse(key: string): unknown {
    const raw = this.driver.getItem(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}

/** Fills in fields added by later schema versions, the way Room's defaults do. */
function normalizeOpenTask(row: OpenTask): OpenTask {
  return {
    ...row,
    firstWarningAtMillis: row.firstWarningAtMillis ?? null,
    recurEveryN: row.recurEveryN ?? null,
    recurUnit: row.recurUnit ?? null,
    recurDaysOfWeek: row.recurDaysOfWeek ?? null,
    seriesId: row.seriesId ?? null,
    pendingDone: row.pendingDone ?? false,
    pendingCreate: row.pendingCreate ?? false,
    pendingUpdate: row.pendingUpdate ?? false,
  };
}
