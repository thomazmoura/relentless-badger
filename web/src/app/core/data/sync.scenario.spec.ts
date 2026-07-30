import { NetworkError } from '../domain/errors';
import { BadgerScenario } from '../testing/badger-scenario';

// Ported from SyncScenarios.kt.
describe('syncing', () => {
  let badger: BadgerScenario;

  beforeEach(() => {
    badger = new BadgerScenario();
  });

  it('a task the server stopped listing is pruned locally and its alarm cancelled', async () => {
    const task = await badger.givenSyncedTask('done elsewhere');
    badger.server.tasks.delete(task.id);

    await badger.whenSyncRuns();

    await badger.thenTaskGone('done elsewhere');
    expect(badger.alarms.cancelled).toContain(task.id);
    badger.thenNoAlarmArmed(task.id);
  });

  it('an offline-created task whose push failed survives the pull instead of being pruned', async () => {
    badger.server.failCreatesWithServerError = true;
    const task = await badger.whenTaskCreated('must not vanish');

    await badger.whenSyncRuns(); // push fails with 500 (flag kept), pull still happens

    await badger.thenTaskVisible('must not vanish');
    expect((await badger.localTask(task.id)).pendingCreate, 'still queued for the next sync').toBe(
      true,
    );

    badger.server.failCreatesWithServerError = false;
    await badger.whenSyncRuns();
    badger.thenServerHasOpenTask('must not vanish');
  });

  it('a task created on another device appears locally with an armed reminder after sync', async () => {
    const dto = badger.givenServerHasOpenTask('from the other phone');

    await badger.whenSyncRuns();

    await badger.thenTaskVisible('from the other phone');
    expect(badger.alarms.scheduled.get(dto.id), 'alarm armed for the new task').toBeDefined();
  });

  it('a sync that dies mid-pull loses no local data and no pending flags', async () => {
    const synced = await badger.givenSyncedTask('already here');
    badger.givenOffline();
    const created = await badger.whenTaskCreated('made offline');
    badger.givenOnline();
    badger.server.failTaskPull = true;

    await badger.whenSyncFailsWith((error) => error instanceof NetworkError);

    await badger.thenTaskVisible('already here');
    await badger.thenTaskVisible('made offline');
    expect(await badger.taskDao.getById(synced.id)).not.toBeNull();
    // The create was pushed before the pull died, so its flag is rightly
    // cleared; the row itself must still be intact.
    expect((await badger.localTask(created.id)).title).toBe('made offline');

    badger.server.failTaskPull = false;
    await badger.whenSyncRuns();
    badger.thenServerHasOpenTask('made offline');
  });
});
