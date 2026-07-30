import { ApiError } from '../domain/errors';
import { BadgerScenario } from '../testing/badger-scenario';

// Ported from AuthScenarios.kt.
describe('auth', () => {
  let badger: BadgerScenario;

  beforeEach(() => {
    badger = new BadgerScenario();
  });

  it('a rejected session loses nothing - the queue survives and pushes after re-login', async () => {
    badger.givenOffline();
    const created = await badger.whenTaskCreated('made offline');
    badger.givenOnline();
    badger.server.unauthorized = true;

    await badger.whenSyncFailsWith((error) => error instanceof ApiError && error.status === 401);

    await badger.thenTaskVisible('made offline');
    expect((await badger.localTask(created.id)).pendingCreate, 'create still queued').toBe(true);

    badger.server.unauthorized = false; // user signed in again
    await badger.whenSyncRuns();

    badger.thenServerHasOpenTask('made offline');
  });

  it('signing out flushes the pending queue before clearing local data', async () => {
    badger.givenOffline();
    const task = await badger.whenTaskCreated('made offline');
    await badger.whenTaskCompleted(task.id);
    badger.givenOnline();

    await badger.repository.signOut();

    expect(badger.server.receivedCreates.length).toBe(1);
    expect(badger.server.receivedCreates[0].id, 'create pushed before wiping').toBe(task.id);
    expect(badger.server.receivedCompletions).toEqual([task.id]);
    expect(await badger.taskDao.getAll(), 'local tasks wiped').toEqual([]);
    expect(await badger.repository.titles(), 'title history wiped').toEqual([]);
  });
});
