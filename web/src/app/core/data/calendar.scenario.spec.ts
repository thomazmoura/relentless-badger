import { recurrenceOf } from '../domain/models';
import { BadgerScenario, MINUTE } from '../testing/badger-scenario';

/**
 * Ported from CalendarScenarios.kt. The calendar's completion history:
 * completing a task caches it locally the moment it happens, and sync fills in
 * completions from other devices — so the calendar works offline and never
 * loses the truthful local completion time.
 */
describe('calendar history', () => {
  let badger: BadgerScenario;

  beforeEach(() => {
    badger = new BadgerScenario();
  });

  it("completing a task offline caches it with the local clock's timestamp", async () => {
    const task = await badger.givenSyncedTask('water plants');
    badger.givenOffline();
    badger.whenTimeAdvancesMinutes(30);

    await badger.whenTaskCompleted(task.id);

    await badger.thenCompletionCached('water plants', badger.clock.now());
  });

  it('the cached completion survives the sync that removes the open row', async () => {
    const task = await badger.givenSyncedTask('water plants');

    await badger.whenTaskCompleted(task.id);
    await badger.whenSyncRuns();

    expect(await badger.taskDao.getById(task.id), 'open row flushed').toBeNull();
    await badger.thenCompletionCached('water plants');
  });

  it('sync pulls completions made on other devices into the cache', async () => {
    badger.givenServerHasCompletedTask('walk dog', badger.clock.now() - 10 * MINUTE);

    await badger.whenSyncRuns();

    await badger.thenCompletionCached('walk dog', badger.clock.now() - 10 * MINUTE);
  });

  it("the server's later push-time stamp never overwrites the local completion time", async () => {
    const task = await badger.givenSyncedTask('water plants');
    badger.givenOffline();
    await badger.whenTaskCompleted(task.id);
    const completedLocallyAt = badger.clock.now();

    badger.whenTimeAdvancesMinutes(120);
    badger.givenOnline();
    await badger.whenSyncRuns();

    expect(badger.server.tasks.get(task.id)?.completedAt).toBeTruthy();
    await badger.thenCompletionCached('water plants', completedLocallyAt);
  });

  it('signing out clears the completion cache', async () => {
    const task = await badger.givenSyncedTask('water plants');
    await badger.whenTaskCompleted(task.id);

    await badger.repository.signOut();

    expect(await badger.completedCache(), 'cache cleared on sign-out').toEqual([]);
  });

  it('completing a recurring occurrence caches it tagged with its series', async () => {
    const task = await badger.whenTaskCreated(
      'meds',
      badger.clock.now() + 60 * MINUTE,
      recurrenceOf(1, 'days'),
    );

    await badger.whenTaskCompleted(task.id);

    const cache = await badger.completedCache();
    expect(cache.length).toBe(1);
    expect(cache[0].seriesId).toBe(task.seriesId);
  });
});
