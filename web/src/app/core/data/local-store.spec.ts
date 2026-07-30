import { CompletedTask, OpenTask } from '../domain/models';
import { BadgerStore, KEYS, SCHEMA_VERSION } from './local-store';
import { MemoryStorageDriver, StorageDriver } from './storage';
import { CompletedTaskStore, OpenTaskStore, TitleStore } from './task-store';

/**
 * The localStorage counterpart of Room's MigrationTest: what the store does
 * with an existing, an empty, a corrupt and a full medium.
 */
describe('BadgerStore', () => {
  const task = (id: string, overrides: Partial<OpenTask> = {}): OpenTask => ({
    id,
    title: id,
    createdAtMillis: 1000,
    initialDelayMinutes: 60,
    repeatIntervalMinutes: 15,
    firstWarningAtMillis: null,
    nextFireAtMillis: 2000,
    recurEveryN: null,
    recurUnit: null,
    recurDaysOfWeek: null,
    seriesId: null,
    pendingDone: false,
    pendingCreate: false,
    pendingUpdate: false,
    ...overrides,
  });

  const completion = (id: string, atMillis: number): CompletedTask => ({
    id,
    title: id,
    completedAtMillis: atMillis,
    seriesId: null,
    cancelled: false,
  });

  it('stamps the schema version on a fresh install', () => {
    const driver = new MemoryStorageDriver();
    new BadgerStore(driver);
    expect(driver.getItem(KEYS.version)).toBe(String(SCHEMA_VERSION));
  });

  it('reads rows written by a previous session', async () => {
    const driver = new MemoryStorageDriver();
    driver.setItem(KEYS.version, String(SCHEMA_VERSION));
    driver.setItem(KEYS.openTasks, JSON.stringify([task('a'), task('b')]));

    const tasks = new OpenTaskStore(new BadgerStore(driver));
    expect((await tasks.getAll()).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('fills in fields a row written by an older schema lacks', async () => {
    const driver = new MemoryStorageDriver();
    // A row from before recurrence and the pending flags existed.
    driver.setItem(
      KEYS.openTasks,
      JSON.stringify([
        {
          id: 'a',
          title: 'a',
          createdAtMillis: 1,
          initialDelayMinutes: 60,
          repeatIntervalMinutes: 15,
          nextFireAtMillis: 2,
        },
      ]),
    );

    const stored = await new OpenTaskStore(new BadgerStore(driver)).getById('a');
    expect(stored).toMatchObject({
      recurEveryN: null,
      seriesId: null,
      pendingCreate: false,
      pendingDone: false,
    });
  });

  it('recovers from a corrupt value instead of refusing to start', async () => {
    const driver = new MemoryStorageDriver();
    driver.setItem(KEYS.openTasks, '{not json');
    driver.setItem(KEYS.session, 'also not json');

    const store = new BadgerStore(driver);
    expect(await new OpenTaskStore(store).getAll()).toEqual([]);
    expect(store.currentSession().waitMinutes).toEqual([60, 240]);
  });

  it('writes each touched key once per batch, not once per row', async () => {
    const driver = new MemoryStorageDriver();
    const writes: string[] = [];
    const counting: StorageDriver = {
      getItem: (k) => driver.getItem(k),
      setItem: (k, v) => {
        writes.push(k);
        driver.setItem(k, v);
      },
      removeItem: (k) => driver.removeItem(k),
      keys: () => driver.keys(),
    };
    const store = new BadgerStore(counting);
    const tasks = new OpenTaskStore(store);
    writes.length = 0;

    // Mutations made in one synchronous batch share a single flush; the
    // microtask only runs once the batch yields.
    await Promise.all([tasks.upsert(task('a')), tasks.upsert(task('b')), tasks.upsert(task('c'))]);
    store.flush();

    expect(writes).toEqual([KEYS.openTasks]);
    expect(JSON.parse(driver.getItem(KEYS.openTasks)!).length).toBe(3);
  });

  it('drops old completion history rather than losing the write when storage is full', async () => {
    const driver = new MemoryStorageDriver();
    const store = new BadgerStore(driver);
    const completedStore = new CompletedTaskStore(store);
    const recent = Date.now();
    const ancient = Date.now() - 5 * 365 * 24 * 60 * 60 * 1000;
    await completedStore.insertIgnoring([completion('old', ancient), completion('new', recent)]);
    store.flush();

    let full = true;
    const flaky: StorageDriver = {
      getItem: (k) => driver.getItem(k),
      setItem: (k, v) => {
        // Fails once, as a browser does the first time the quota is hit.
        if (full && k === KEYS.openTasks) {
          full = false;
          const error = new Error('full');
          error.name = 'QuotaExceededError';
          throw error;
        }
        driver.setItem(k, v);
      },
      removeItem: (k) => driver.removeItem(k),
      keys: () => driver.keys(),
    };
    const store2 = new BadgerStore(flaky);
    await new OpenTaskStore(store2).upsert(task('a'));
    store2.flush();

    expect(JSON.parse(driver.getItem(KEYS.openTasks)!).length).toBe(1);
    expect(
      JSON.parse(driver.getItem(KEYS.completedTasks)!).map((r: CompletedTask) => r.id),
    ).toEqual(['new']);
  });

  it('re-reads a key another tab rewrote', async () => {
    const driver = new MemoryStorageDriver();
    const store = new BadgerStore(driver);
    const tasks = new OpenTaskStore(store);
    await tasks.upsert(task('mine'));
    store.flush();

    // A second tab replaces the key wholesale, as its own flush would.
    driver.setItem(KEYS.openTasks, JSON.stringify([task('theirs')]));
    expect(BadgerStore.storeKeyFor(KEYS.openTasks)).toBe('openTasks');
    store.reload('openTasks');

    expect((await tasks.getAll()).map((t) => t.id)).toEqual(['theirs']);
  });

  it('clears every table on sign-out', async () => {
    const driver = new MemoryStorageDriver();
    const store = new BadgerStore(driver);
    await new OpenTaskStore(store).upsert(task('a'));
    await new CompletedTaskStore(store).upsert(completion('a', 1));
    await new TitleStore(store).recordUse('a', 1);
    store.patchSession({ token: 'jwt' });

    store.clearAll();

    expect(await new OpenTaskStore(store).getAll()).toEqual([]);
    expect(await new TitleStore(store).getRanked()).toEqual([]);
    expect(store.currentSession().token).toBeNull();
  });
});
