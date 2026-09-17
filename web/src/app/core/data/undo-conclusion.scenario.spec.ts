import { recurrenceOf } from '../domain/models';
import { toIsoInstant } from '../domain/time';
import { BadgerScenario, MINUTE } from '../testing/badger-scenario';

// Ported from UndoConclusionScenarios.kt.
describe('undoing a conclusion', () => {
  let badger: BadgerScenario;
  const daily = recurrenceOf(1, 'days');

  beforeEach(() => {
    badger = new BadgerScenario();
  });

  it('undoing a completion before it is pushed brings the task back, nagging', async () => {
    const task = await badger.givenSyncedTask('water plants');
    badger.givenOffline();

    const concluded = (await badger.whenTaskCompleted(task.id))!;
    await badger.thenTaskGone('water plants');

    await badger.whenConclusionUndone(concluded);

    await badger.thenTaskVisible('water plants');
    await badger.thenNoCompletionCached('water plants');
    expect(badger.alarms.scheduled.get(task.id), 'the task is armed again').toBeDefined();
    expect(
      (await badger.localTask(task.id)).pendingDone,
      'no longer waiting to be pushed as done',
    ).toBe(false);
    badger.thenNothingPushed();
  });

  it('undoing a cancellation restores the task the same way', async () => {
    const task = await badger.givenSyncedTask('water plants');
    badger.givenOffline();

    const concluded = (await badger.whenTaskCancelled(task.id))!;
    expect(concluded.cancelled, 'the receipt remembers how it was closed').toBe(true);

    await badger.whenConclusionUndone(concluded);

    await badger.thenTaskVisible('water plants');
    await badger.thenNoCompletionCached('water plants');
    expect(badger.alarms.scheduled.get(task.id)).toBeDefined();
  });

  it('undoing after the completion was pushed reopens the task on the server', async () => {
    const task = await badger.givenSyncedTask('water plants');

    const concluded = (await badger.whenTaskCompleted(task.id))!;
    await badger.whenSyncRuns();
    expect(await badger.taskDao.getById(task.id), 'the flush deleted the local row').toBeNull();

    await badger.whenConclusionUndone(concluded);

    // Back immediately, without waiting for the server to be told.
    await badger.thenTaskVisible('water plants');
    expect((await badger.localTask(task.id)).pendingReopen, 'queued for the server').toBe(true);

    await badger.whenSyncRuns();

    expect(badger.server.receivedReopens).toEqual([task.id]);
    badger.thenServerHasOpenTask('water plants');
    expect((await badger.localTask(task.id)).pendingReopen, 'flag cleared once acknowledged').toBe(
      false,
    );
    await badger.thenNoCompletionCached('water plants');
  });

  it("undo restores the task's own schedule, not a fresh one", async () => {
    const startAt = badger.clock.now() + 60 * MINUTE;
    const task = await badger.whenTaskCreated('water plants', startAt);
    await badger.whenSyncRuns();

    const concluded = (await badger.whenTaskCompleted(task.id))!;
    await badger.whenSyncRuns();
    await badger.whenConclusionUndone(concluded);

    const restored = await badger.localTask(task.id);
    expect(restored.createdAtMillis).toBe(task.createdAtMillis);
    expect(restored.firstWarningAtMillis).toBe(task.firstWarningAtMillis);
    expect(restored.initialDelayMinutes).toBe(task.initialDelayMinutes);
    expect(restored.repeatIntervalMinutes).toBe(task.repeatIntervalMinutes);
    expect(restored.recurEveryN).toBe(task.recurEveryN);
    expect(restored.seriesId).toBe(task.seriesId);
  });

  it('a wait set before concluding survives the undo', async () => {
    const task = await badger.givenSyncedTask('water plants');
    const waitUntil = badger.clock.now() + 180 * MINUTE;
    await badger.whenSnoozedUntil(task.id, waitUntil);

    const concluded = (await badger.whenTaskCompleted(task.id))!;
    await badger.whenConclusionUndone(concluded);

    badger.thenAlarmScheduledAt(task.id, waitUntil);
  });

  it('a fire time the clock ran past while the snackbar was up is recomputed', async () => {
    const task = await badger.givenSyncedTask('water plants');
    const concluded = (await badger.whenTaskCompleted(task.id))!;

    badger.whenTimeAdvancesMinutes(600); // long past the fire time it was carrying

    await badger.whenConclusionUndone(concluded);

    const restored = await badger.localTask(task.id);
    expect(
      restored.nextFireAtMillis > badger.clock.now(),
      'restored with a fire time ahead, not one that nags instantly',
    ).toBe(true);
    badger.thenAlarmScheduledAt(task.id, restored.nextFireAtMillis);
  });

  it('undoing a backdated completion forgets the record at the backdated time', async () => {
    const task = await badger.givenSyncedTask('water plants');
    const doneAt = badger.clock.now();
    badger.whenTimeAdvancesMinutes(300);

    const concluded = (await badger.whenTaskCompleted(task.id, doneAt))!;
    expect(concluded.completedAtMillis).toBe(doneAt);

    await badger.whenConclusionUndone(concluded);

    await badger.thenNoCompletionCached('water plants');
    await badger.thenTaskVisible('water plants');
  });

  it('undoing a recurring completion takes back the occurrence it spawned', async () => {
    badger.givenOffline();
    const startAt = badger.clock.now() + 60 * MINUTE;
    const task = await badger.whenTaskCreated('water plants', startAt, daily);
    badger.whenTimeAdvancesMinutes(90);

    const concluded = (await badger.whenTaskCompleted(task.id))!;
    const spawnedId = concluded.spawnedId!;
    expect(
      await badger.taskDao.getById(spawnedId),
      'the spawn exists before the undo',
    ).not.toBeNull();

    await badger.whenConclusionUndone(concluded);

    expect(await badger.taskDao.getById(spawnedId), 'the spawn is gone').toBeNull();
    expect(badger.alarms.cancelled, 'its alarm was cancelled').toContain(spawnedId);
    expect(await badger.openTaskTitles()).toEqual(['water plants']);
    expect((await badger.taskDao.getActive()).map((row) => row.id)).toEqual([task.id]);
  });

  it('undoing a recurring completion deletes a spawn the server already knows', async () => {
    const startAt = badger.clock.now() + 60 * MINUTE;
    const task = await badger.whenTaskCreated('water plants', startAt, daily);
    await badger.whenSyncRuns();
    badger.whenTimeAdvancesMinutes(90);

    const concluded = (await badger.whenTaskCompleted(task.id))!;
    await badger.whenSyncRuns(); // pushes the spawn's create
    const spawnedId = concluded.spawnedId!;
    expect((await badger.localTask(spawnedId)).pendingCreate, 'the server has it').toBe(false);

    await badger.whenConclusionUndone(concluded);

    // Hidden at once, even though the server hasn't been told yet.
    expect(await badger.openTaskTitles()).toEqual(['water plants']);
    expect((await badger.taskDao.getActive()).map((row) => row.id)).toEqual([task.id]);

    await badger.whenSyncRuns();

    expect(badger.server.receivedDeletes).toEqual([spawnedId]);
    expect(
      await badger.taskDao.getById(spawnedId),
      'row dropped once the server agreed',
    ).toBeNull();
  });

  it('a revoked spawn stays hidden and unarmed while its delete is pending', async () => {
    const startAt = badger.clock.now() + 60 * MINUTE;
    const task = await badger.whenTaskCreated('water plants', startAt, daily);
    await badger.whenSyncRuns();
    badger.whenTimeAdvancesMinutes(90);
    const concluded = (await badger.whenTaskCompleted(task.id))!;
    await badger.whenSyncRuns();

    badger.givenOffline();
    await badger.whenConclusionUndone(concluded);
    await badger.whenBootReArmRuns();

    const spawnedId = concluded.spawnedId!;
    expect(
      badger.alarms.scheduled.get(spawnedId),
      'a revoked occurrence is never re-armed',
    ).toBeUndefined();
    expect((await badger.taskDao.getActive()).map((row) => row.id)).toEqual([task.id]);
  });

  it('an occurrence the user has already acted on is left alone', async () => {
    badger.givenOffline();
    const startAt = badger.clock.now() + 60 * MINUTE;
    const task = await badger.whenTaskCreated('water plants', startAt, daily);
    badger.whenTimeAdvancesMinutes(90);
    const concluded = (await badger.whenTaskCompleted(task.id))!;
    const spawnedId = concluded.spawnedId!;

    // The user got ahead and did the next one too.
    await badger.whenTaskCompleted(spawnedId);

    await badger.whenConclusionUndone(concluded);

    await badger.thenCompletionCached('water plants');
    expect(
      await badger.taskDao.getById(spawnedId),
      'the occurrence they acted on survives',
    ).not.toBeNull();
  });

  it('a pull before the reopen is pushed does not resurrect the completion', async () => {
    const task = await badger.givenSyncedTask('water plants');
    const concluded = (await badger.whenTaskCompleted(task.id))!;
    await badger.whenSyncRuns();

    await badger.whenConclusionUndone(concluded);
    await badger.whenSyncRuns();

    // The reopen went first, so the done list no longer carries it.
    await badger.thenNoCompletionCached('water plants');
    await badger.thenTaskVisible('water plants');
  });

  it('a reopen the server knows nothing about is dropped instead of retried forever', async () => {
    const task = await badger.givenSyncedTask('water plants');
    const concluded = (await badger.whenTaskCompleted(task.id))!;
    await badger.whenSyncRuns();
    badger.server.tasks.delete(task.id); // deleted from another device

    await badger.whenConclusionUndone(concluded);
    await badger.whenSyncRuns();

    // There is no conclusion left to undo, and the pull prunes a task the server
    // no longer has — the deletion elsewhere wins, as it does for a completion
    // the server has forgotten.
    expect(await badger.taskDao.getById(task.id), 'row pruned by the pull').toBeNull();
    badger.server.receivedReopens.length = 0;
    await badger.whenSyncRuns();
    expect(badger.server.receivedReopens, 'no reopen retries').toEqual([]);
  });

  it('undoing a task created and concluded offline leaves a plain pending create', async () => {
    badger.givenOffline();
    const task = await badger.whenTaskCreated('water plants');
    const concluded = (await badger.whenTaskCompleted(task.id))!;

    await badger.whenConclusionUndone(concluded);

    badger.givenOnline();
    await badger.whenSyncRuns();

    expect(badger.server.receivedCreates.map((request) => request.id)).toEqual([task.id]);
    expect(badger.server.receivedCompletions, 'nothing to undo on the server').toEqual([]);
    badger.thenServerHasOpenTask('water plants');
    await badger.thenTaskVisible('water plants');
  });

  it('concluding again after an undo closes the task at the later moment', async () => {
    const task = await badger.givenSyncedTask('water plants');
    const concluded = (await badger.whenTaskCompleted(task.id))!;
    await badger.whenSyncRuns();
    await badger.whenConclusionUndone(concluded);

    badger.whenTimeAdvancesMinutes(120);
    const closedAgain = badger.clock.now();
    await badger.whenTaskCompleted(task.id);
    await badger.whenSyncRuns();

    // The reopen is pushed before the completion, so the server's idempotent
    // complete records the new moment rather than keeping the undone one.
    expect(badger.server.receivedReopens).toEqual([task.id]);
    expect(badger.server.tasks.get(task.id)?.completedAt).toBe(toIsoInstant(closedAgain));
  });

  it('undoing the same conclusion twice is harmless', async () => {
    const task = await badger.givenSyncedTask('water plants');
    const concluded = (await badger.whenTaskCompleted(task.id))!;

    await badger.whenConclusionUndone(concluded);
    await badger.whenConclusionUndone(concluded);

    await badger.thenTaskVisible('water plants');
    expect((await badger.taskDao.getActive()).length).toBe(1);
  });
});
