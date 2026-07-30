import { NetworkError } from '../domain/errors';
import { toIsoInstant } from '../domain/time';
import { BadgerScenario } from '../testing/badger-scenario';

// Ported from CompleteTaskScenarios.kt.
describe('completing a task', () => {
  let badger: BadgerScenario;

  beforeEach(() => {
    badger = new BadgerScenario();
  });

  it('disabling a task online hides it, cancels its alarm and pushes the completion', async () => {
    const task = await badger.givenSyncedTask('water plants');

    await badger.whenTaskCompleted(task.id);

    await badger.thenTaskGone('water plants');
    expect(badger.alarms.cancelled).toContain(task.id);

    await badger.whenSyncRuns();

    expect(badger.server.receivedCompletions).toEqual([task.id]);
    badger.thenServerDoesNotHaveOpenTask('water plants');
    expect(await badger.taskDao.getById(task.id), 'row removed once acknowledged').toBeNull();
  });

  it('disabling a task offline takes effect immediately and is pushed when connectivity returns', async () => {
    const task = await badger.givenSyncedTask('water plants');
    badger.givenOffline();

    await badger.whenTaskCompleted(task.id);

    await badger.thenTaskGone('water plants');
    expect(badger.alarms.cancelled).toContain(task.id);
    expect(badger.server.receivedCompletions).toEqual([]);

    badger.givenOnline();
    await badger.whenSyncRuns();

    expect(badger.server.receivedCompletions).toEqual([task.id]);
    badger.thenServerDoesNotHaveOpenTask('water plants');
  });

  it('a completion the server no longer knows about is dropped instead of retried forever', async () => {
    const task = await badger.givenSyncedTask('water plants');
    badger.server.tasks.delete(task.id); // deleted from another device

    await badger.whenTaskCompleted(task.id);
    await badger.whenSyncRuns();

    expect(await badger.taskDao.getById(task.id), 'row removed after the 404').toBeNull();
    await badger.whenSyncRuns();
    expect(badger.server.receivedCompletions, 'no completion retries').toEqual([]);
  });

  it('a completion that fails on a dead network stays queued and a later sync flushes it', async () => {
    const task = await badger.givenSyncedTask('water plants');

    await badger.whenTaskCompleted(task.id);
    badger.givenOffline();
    await badger.whenSyncFailsWith((error) => error instanceof NetworkError);

    expect((await badger.localTask(task.id)).pendingDone, 'still queued').toBe(true);

    badger.givenOnline();
    await badger.whenSyncRuns();

    expect(badger.server.receivedCompletions).toEqual([task.id]);
    expect(await badger.taskDao.getById(task.id)).toBeNull();
  });

  it('a completion pushed by a later sync keeps the time the task was completed, not the sync time', async () => {
    const task = await badger.givenSyncedTask('water plants');
    badger.givenOffline();

    await badger.whenTaskCompleted(task.id);
    const completedAtMillis = badger.clock.now();

    badger.whenTimeAdvancesMinutes(90);
    badger.givenOnline();
    await badger.whenSyncRuns();

    expect(
      badger.server.tasks.get(task.id)?.completedAt,
      'server records the local completion time',
    ).toBe(toIsoInstant(completedAtMillis));
  });

  it('a task created and completed entirely offline reaches the server as a completed task', async () => {
    badger.givenOffline();

    const task = await badger.whenTaskCreated('water plants');
    await badger.whenTaskCompleted(task.id);
    await badger.thenTaskGone('water plants');

    badger.givenOnline();
    await badger.whenSyncRuns();

    expect(badger.server.receivedCreates.length).toBe(1);
    expect(badger.server.receivedCreates[0].id, 'create pushed before the completion').toBe(
      task.id,
    );
    expect(badger.server.receivedCompletions).toEqual([task.id]);
    expect(
      badger.server.tasks.get(task.id)?.completedAt,
      'server has the task, completed',
    ).toBeTruthy();
  });
});
