import { computed, Signal } from '@angular/core';
import { CompletedTask, OpenTask, TitleHistory } from '../domain/models';
import { BadgerStore } from './local-store';

/**
 * The DAOs, method for method. Each one is the Room query it replaces, with the
 * same ordering and the same conflict behaviour — the comments explain why the
 * odd-looking ones are the way they are, because those reasons carry over.
 *
 * They stay async so the repository reads exactly like its Kotlin original and
 * so a future move off localStorage doesn't ripple upward.
 */

const MAX_RANKED_TITLES = 500;

export class OpenTaskStore {
  constructor(private readonly store: BadgerStore) {}

  /** WHERE pendingDone = 0 ORDER BY nextFireAtMillis ASC, createdAtMillis DESC */
  observeActive(): Signal<OpenTask[]> {
    return computed(() =>
      this.store
        .openTasks()
        .filter((task) => !task.pendingDone)
        .sort(
          (a, b) =>
            a.nextFireAtMillis - b.nextFireAtMillis || b.createdAtMillis - a.createdAtMillis,
        ),
    );
  }

  async getActive(): Promise<OpenTask[]> {
    return [...this.store.openTaskMap().values()].filter((task) => !task.pendingDone);
  }

  async getAll(): Promise<OpenTask[]> {
    return [...this.store.openTaskMap().values()];
  }

  async getById(id: string): Promise<OpenTask | null> {
    return this.store.openTaskMap().get(id) ?? null;
  }

  async getPendingDone(): Promise<OpenTask[]> {
    return (await this.getAll()).filter((task) => task.pendingDone);
  }

  async getPendingCreate(): Promise<OpenTask[]> {
    return (await this.getAll()).filter((task) => task.pendingCreate);
  }

  /**
   * Rows still pendingCreate are excluded: the PUT would 404 on a server that
   * never saw the task. Creates are pushed (and the flag cleared) earlier in the
   * same sync, so an edited fresh task gets its update through right after.
   */
  async getPendingUpdate(): Promise<OpenTask[]> {
    return (await this.getAll()).filter(
      (task) => task.pendingUpdate && !task.pendingCreate && !task.pendingDone,
    );
  }

  async upsert(task: OpenTask): Promise<void> {
    this.store.mutateOpenTasks((rows) => rows.set(task.id, task));
  }

  async upsertAll(tasks: readonly OpenTask[]): Promise<void> {
    this.store.mutateOpenTasks((rows) => {
      for (const task of tasks) rows.set(task.id, task);
    });
  }

  async markPendingDone(id: string): Promise<void> {
    this.store.mutateOpenTasks((rows) => {
      const task = rows.get(id);
      if (task) rows.set(id, { ...task, pendingDone: true });
    });
  }

  async clearPendingCreate(id: string): Promise<void> {
    this.store.mutateOpenTasks((rows) => {
      const task = rows.get(id);
      if (task) rows.set(id, { ...task, pendingCreate: false });
    });
  }

  async clearPendingUpdate(id: string): Promise<void> {
    this.store.mutateOpenTasks((rows) => {
      const task = rows.get(id);
      if (task) rows.set(id, { ...task, pendingUpdate: false });
    });
  }

  async delete(id: string): Promise<void> {
    this.store.mutateOpenTasks((rows) => rows.delete(id));
  }

  /**
   * Prunes tasks the server no longer lists as open. Rows with pending local
   * changes are kept: an unpushed create or completion must never be lost to a
   * pull that ran before the push could reach the server.
   */
  async deleteSyncedNotIn(ids: readonly string[]): Promise<void> {
    const keep = new Set(ids);
    this.store.mutateOpenTasks((rows) => {
      for (const [id, task] of rows) {
        if (!task.pendingDone && !task.pendingCreate && !keep.has(id)) rows.delete(id);
      }
    });
  }

  async clear(): Promise<void> {
    this.store.mutateOpenTasks((rows) => rows.clear());
  }
}

export class CompletedTaskStore {
  constructor(private readonly store: BadgerStore) {}

  /** completedAtMillis in [from, to) ORDER BY completedAtMillis ASC, id ASC */
  observeBetween(fromMillis: Signal<number>, toMillis: Signal<number>): Signal<CompletedTask[]> {
    return computed(() => {
      const from = fromMillis();
      const to = toMillis();
      return this.store
        .completedTasks()
        .filter((row) => row.completedAtMillis >= from && row.completedAtMillis < to)
        .sort(
          (a, b) =>
            a.completedAtMillis - b.completedAtMillis || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
        );
    });
  }

  async between(fromMillis: number, toMillis: number): Promise<CompletedTask[]> {
    return [...this.store.completedTaskMap().values()]
      .filter((row) => row.completedAtMillis >= fromMillis && row.completedAtMillis < toMillis)
      .sort(
        (a, b) =>
          a.completedAtMillis - b.completedAtMillis || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
  }

  async getById(id: string): Promise<CompletedTask | null> {
    return this.store.completedTaskMap().get(id) ?? null;
  }

  async upsert(entry: CompletedTask): Promise<void> {
    this.store.mutateCompletedTasks((rows) => rows.set(entry.id, entry));
  }

  /**
   * Sync pull: existing rows win, so an offline completion's true local
   * timestamp is never overwritten by the server's later push-time stamp.
   * Completions made on other devices don't exist locally and insert normally.
   */
  async insertIgnoring(entries: readonly CompletedTask[]): Promise<void> {
    this.store.mutateCompletedTasks((rows) => {
      for (const entry of entries) {
        if (!rows.has(entry.id)) rows.set(entry.id, entry);
      }
    });
  }

  async clear(): Promise<void> {
    this.store.mutateCompletedTasks((rows) => rows.clear());
  }
}

export class TitleStore {
  constructor(private readonly store: BadgerStore) {}

  /** WHERE dismissed = 0 ORDER BY useCount DESC, lastUsedAtMillis DESC LIMIT 500 */
  async getRanked(): Promise<string[]> {
    return [...this.store.titleMap().values()]
      .filter((row) => !row.dismissed)
      .sort((a, b) => b.useCount - a.useCount || b.lastUsedAtMillis - a.lastUsedAtMillis)
      .slice(0, MAX_RANKED_TITLES)
      .map((row) => row.title);
  }

  async getByTitle(title: string): Promise<TitleHistory | null> {
    return this.store.titleMap().get(title) ?? null;
  }

  async upsert(entry: TitleHistory): Promise<void> {
    this.store.mutateTitles((rows) => rows.set(entry.title, entry));
  }

  async dismiss(title: string): Promise<void> {
    this.store.mutateTitles((rows) => {
      const row = rows.get(title);
      if (row) rows.set(title, { ...row, dismissed: true });
    });
  }

  async restore(title: string): Promise<void> {
    this.store.mutateTitles((rows) => {
      const row = rows.get(title);
      if (row) rows.set(title, { ...row, dismissed: false });
    });
  }

  async recordUse(title: string, nowMillis: number): Promise<void> {
    this.store.mutateTitles((rows) => {
      const existing = rows.get(title);
      // Deliberately using a title again is the clearest sign the user wants it
      // suggested, so it also undoes an earlier dismissal.
      rows.set(title, {
        title,
        useCount: (existing?.useCount ?? 0) + 1,
        lastUsedAtMillis: nowMillis,
        dismissed: false,
      });
    });
  }

  /**
   * Merges titles the server knows (e.g. from another device). Only unknown
   * titles are inserted, as single uses; local usage counts always win. The
   * staggered timestamps preserve the server's frequency ordering among them.
   */
  async upsertFromServer(titles: readonly string[], nowMillis: number): Promise<void> {
    this.store.mutateTitles((rows) => {
      titles.forEach((title, index) => {
        if (!rows.has(title)) {
          rows.set(title, {
            title,
            useCount: 1,
            lastUsedAtMillis: nowMillis - index,
            dismissed: false,
          });
        }
      });
    });
  }

  async clear(): Promise<void> {
    this.store.mutateTitles((rows) => rows.clear());
  }
}
