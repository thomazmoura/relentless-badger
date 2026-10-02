import { batchCount, recurrenceOf } from '../domain/models';
import { toIsoInstant } from '../domain/time';
import { BadgerScenario, MINUTE } from '../testing/badger-scenario';

// Ported from DoneEarlierScenarios.kt.
describe('marking things done at an earlier moment', () => {
  let badger: BadgerScenario;
  const day = 24 * 60 * MINUTE;

  beforeEach(() => {
    badger = new BadgerScenario();
  });

  it('the candidates are the tasks open then and the recent completions that were done', async () => {
    const start = badger.clock.now();
    badger.givenServerHasCompletedTask('stretch', start);
    badger.givenServerHasCompletedTask('gym', start, true);
    badger.givenServerHasCompletedTask('old chore', start - 3 * day);
    await badger.givenSyncedTask('water plants');
    badger.whenTimeAdvancesMinutes(600);
    await badger.whenTaskCreated('call mom'); // didn't exist yet at the moment being picked

    const candidates = await badger.repository.doneEarlierCandidates(start + 60 * MINUTE);

    expect(candidates.open.map((task) => task.title)).toEqual(['water plants']);
    expect(
      candidates.completed.map((row) => row.title),
      'cancelled and long-past completions are left out',
    ).toEqual(['stretch']);
  });

  it('marking open tasks done earlier credits each at the moment, and a recurring one still recurs', async () => {
    const doneAt = badger.clock.now();
    const plants = await badger.givenSyncedTask('water plants');
    const pills = await badger.whenTaskCreated('take pills', doneAt, recurrenceOf(1, 'days'));
    badger.whenTimeAdvancesMinutes(600); // remembered the next morning

    const batch = await badger.whenMarkedDoneAt(doneAt, [plants.id, pills.id]);

    expect(batchCount(batch)).toBe(2);
    await badger.thenTaskGone('water plants');
    await badger.thenCompletionCached('water plants', doneAt, false);
    await badger.thenCompletionCached('take pills', doneAt, false);
    const nextPills = (await badger.taskDao.getActive()).find(
      (task) => task.title === 'take pills',
    );
    expect(
      nextPills!.firstWarningAtMillis! > badger.clock.now(),
      'the next pills occurrence was spawned',
    ).toBe(true);

    await badger.whenSyncRuns();

    expect(badger.server.tasks.get(plants.id)?.completedAt).toBe(toIsoInstant(doneAt));
    expect(badger.server.tasks.get(pills.id)?.completedAt).toBe(toIsoInstant(doneAt));
  });

  it('moving a pushed completion re-dates it locally and on the server', async () => {
    const doneAt = badger.clock.now();
    const task = await badger.givenSyncedTask('water plants');
    badger.whenTimeAdvancesMinutes(600);
    await badger.whenTaskCompleted(task.id); // tapped late, stamped now
    await badger.whenSyncRuns();

    await badger.whenMarkedDoneAt(doneAt, [], [task.id]);

    await badger.thenCompletionCached('water plants', doneAt);
    await badger.whenSyncRuns();

    expect(badger.server.tasks.get(task.id)?.completedAt).toBe(toIsoInstant(doneAt));
    expect(
      (await badger.completedDao.getById(task.id))!.pendingRetime,
      'nothing left to push',
    ).toBeFalsy();
  });

  it('moving a completion that never reached the server sends it at the new moment', async () => {
    const doneAt = badger.clock.now();
    const task = await badger.givenSyncedTask('water plants');
    badger.givenOffline();
    badger.whenTimeAdvancesMinutes(600);
    await badger.whenTaskCompleted(task.id);

    await badger.whenMarkedDoneAt(doneAt, [], [task.id]);
    badger.givenOnline();
    await badger.whenSyncRuns();

    expect(badger.server.tasks.get(task.id)?.completedAt).toBe(toIsoInstant(doneAt));
    await badger.thenCompletionCached('water plants', doneAt);
  });

  it("a move the server can't take yet survives the pull and is pushed later", async () => {
    const doneAt = badger.clock.now();
    const task = await badger.givenSyncedTask('water plants');
    badger.whenTimeAdvancesMinutes(600);
    await badger.whenTaskCompleted(task.id);
    await badger.whenSyncRuns();
    const stampedAt = badger.clock.now();

    badger.server.failRetimesWithServerError = true;
    await badger.whenMarkedDoneAt(doneAt, [], [task.id]);
    await badger.whenSyncRuns();

    expect(
      badger.server.tasks.get(task.id)?.completedAt,
      'the server still has the old moment',
    ).toBe(toIsoInstant(stampedAt));
    await badger.thenCompletionCached('water plants', doneAt);

    badger.server.failRetimesWithServerError = false;
    await badger.whenSyncRuns();

    expect(badger.server.tasks.get(task.id)?.completedAt).toBe(toIsoInstant(doneAt));
  });

  it('a completion moved on another device is adopted on the next sync', async () => {
    const task = await badger.givenSyncedTask('water plants');
    badger.whenTimeAdvancesMinutes(600);
    await badger.whenTaskCompleted(task.id);
    await badger.whenSyncRuns();

    const movedElsewhere = badger.clock.now() - 300 * MINUTE;
    badger.server.tasks.set(task.id, {
      ...badger.server.tasks.get(task.id)!,
      completedAt: toIsoInstant(movedElsewhere),
    });
    await badger.whenSyncRuns();

    await badger.thenCompletionCached('water plants', movedElsewhere);
  });

  it('a move the server rejects is dropped rather than retried forever', async () => {
    const task = await badger.givenSyncedTask('water plants');
    badger.whenTimeAdvancesMinutes(600);
    await badger.whenTaskCompleted(task.id);
    await badger.whenSyncRuns();
    // Reopened on another device: there is no completion left to move.
    badger.server.tasks.set(task.id, { ...badger.server.tasks.get(task.id)!, completedAt: null });

    await badger.whenMarkedDoneAt(badger.clock.now() - 60 * MINUTE, [], [task.id]);
    await badger.whenSyncRuns();
    await badger.whenSyncRuns();

    expect(badger.server.receivedRetimes).toEqual([]);
    expect(await badger.completedDao.getPendingRetime(), 'no move left waiting').toEqual([]);
    await badger.thenTaskVisible('water plants');
  });

  it('undoing the batch reopens what it closed and puts moved completions back', async () => {
    const doneAt = badger.clock.now();
    const plants = await badger.givenSyncedTask('water plants');
    const trash = await badger.givenSyncedTask('take out trash');
    badger.whenTimeAdvancesMinutes(600);
    await badger.whenTaskCompleted(trash.id);
    await badger.whenSyncRuns();
    const trashStampedAt = badger.clock.now();

    const batch = await badger.whenMarkedDoneAt(doneAt, [plants.id], [trash.id]);
    await badger.whenBatchUndone(batch);

    await badger.thenTaskVisible('water plants');
    await badger.thenNoCompletionCached('water plants');
    await badger.thenCompletionCached('take out trash', trashStampedAt);

    await badger.whenSyncRuns();

    expect(
      badger.server.tasks.get(plants.id)?.completedAt,
      'plants is open on the server',
    ).toBeNull();
    expect(badger.server.tasks.get(trash.id)?.completedAt).toBe(toIsoInstant(trashStampedAt));
  });
});
