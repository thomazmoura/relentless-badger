import { NetworkError } from '../domain/errors';
import { toIsoInstant } from '../domain/time';
import { BadgerScenario, MINUTE } from '../testing/badger-scenario';

// Ported from CreateTaskScenarios.kt.
describe('creating a task', () => {
  let badger: BadgerScenario;

  beforeEach(() => {
    badger = new BadgerScenario();
  });

  it('creating a task online shows it immediately, arms the first reminder and pushes it on sync', async () => {
    const task = await badger.whenTaskCreated('water plants');

    await badger.thenTaskVisible('water plants');
    badger.thenAlarmScheduledAt(task.id, task.createdAtMillis + 60 * MINUTE);
    expect(badger.syncRequests.requests, 'a sync should have been requested').toBe(1);

    await badger.whenSyncRuns();

    badger.thenServerHasOpenTask('water plants');
    expect(badger.server.receivedCreates.length).toBe(1);
    expect(badger.server.receivedCreates[0].id, 'pushed with the locally minted id').toBe(task.id);
    expect(
      (await badger.localTask(task.id)).pendingCreate,
      'pendingCreate cleared once acknowledged',
    ).toBe(false);
  });

  it('creating a task offline works fully locally and is pushed with the same id when connectivity returns', async () => {
    badger.givenOffline();

    const task = await badger.whenTaskCreated('water plants');

    await badger.thenTaskVisible('water plants');
    badger.thenAlarmScheduledAt(task.id, task.createdAtMillis + 60 * MINUTE);
    badger.thenNothingPushed();

    badger.givenOnline();
    await badger.whenSyncRuns();

    badger.thenServerHasOpenTask('water plants');
    expect(badger.server.receivedCreates.length).toBe(1);
    expect(badger.server.receivedCreates[0].id).toBe(task.id);
  });

  it('a custom first warning time is respected offline and carried in the push', async () => {
    badger.givenOffline();
    const tonight = badger.clock.now() + 8 * 60 * MINUTE;

    const task = await badger.whenTaskCreated('call the bank', tonight);

    badger.thenAlarmScheduledAt(task.id, tonight);

    badger.givenOnline();
    await badger.whenSyncRuns();

    expect(badger.server.receivedCreates.length).toBe(1);
    expect(badger.server.receivedCreates[0].firstWarningAt).toBe(toIsoInstant(tonight));
  });

  it('retrying a create whose response was lost does not duplicate the task on the server', async () => {
    badger.server.dropCreateResponses = true;
    const task = await badger.whenTaskCreated('water plants');
    await badger.whenSyncFailsWith((error) => error instanceof NetworkError);

    badger.server.dropCreateResponses = false;
    await badger.whenSyncRuns();

    expect(badger.server.receivedCreates.length, 'both pushes used the same id').toBe(2);
    expect(badger.server.openTasks().filter((t) => t.title === 'water plants').length).toBe(1);
    expect((await badger.localTask(task.id)).pendingCreate).toBe(false);
  });

  it('a new task snapshots the settings it was created under and the push carries them', async () => {
    await badger.givenLocalSettings(30, 5);
    badger.givenOffline();

    const task = await badger.whenTaskCreated('water plants');

    expect(task.initialDelayMinutes).toBe(30);
    expect(task.repeatIntervalMinutes).toBe(5);
    badger.thenAlarmScheduledAt(task.id, task.createdAtMillis + 30 * MINUTE);

    badger.givenOnline();
    await badger.whenSyncRuns();

    expect(badger.server.receivedCreates.length).toBe(1);
    expect(badger.server.receivedCreates[0].initialDelayMinutes).toBe(30);
    expect(badger.server.receivedCreates[0].repeatIntervalMinutes).toBe(5);
  });
});
