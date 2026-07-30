import { recurrenceOf } from '../domain/models';
import { computeNextOccurrence } from '../domain/schedule';
import { BadgerScenario, MINUTE } from '../testing/badger-scenario';

// Ported from RecurringTaskScenarios.kt.
describe('recurring tasks', () => {
  let badger: BadgerScenario;
  const daily = recurrenceOf(1, 'days');
  const day = 24 * 60 * MINUTE;

  beforeEach(() => {
    badger = new BadgerScenario();
  });

  it('creating a recurring task arms the alarm at its start and pushes the rule', async () => {
    const startAt = badger.clock.now() + day;
    const task = await badger.whenTaskCreated('water plants', startAt, daily);

    badger.thenAlarmScheduledAt(task.id, startAt);
    expect(task.seriesId).toBe(task.id);

    await badger.whenSyncRuns();
    expect(badger.server.receivedCreates.length).toBe(1);
    const pushed = badger.server.receivedCreates[0];
    expect(pushed.recurEveryN).toBe(1);
    expect(pushed.recurUnit).toBe('days');
    expect(pushed.seriesId).toBe(task.id);
  });

  it('completing a recurring task spawns the next occurrence locally', async () => {
    badger.givenOffline();
    const startAt = badger.clock.now() + 60 * MINUTE;
    const task = await badger.whenTaskCreated('water plants', startAt, daily);
    badger.whenTimeAdvancesMinutes(90); // past the first occurrence

    await badger.whenTaskCompleted(task.id);

    const active = await badger.taskDao.getActive();
    expect(active.length).toBe(1);
    const spawned = active[0];
    expect(spawned.pendingCreate).toBe(true);
    expect(spawned.title).toBe('water plants');
    expect(spawned.firstWarningAtMillis).toBe(startAt + day);
    expect(spawned.seriesId).toBe(task.id);
    badger.thenAlarmScheduledAt(spawned.id, startAt + day);
    badger.thenNoAlarmArmed(task.id);
  });

  it('completion and the spawned occurrence both reach the server on sync', async () => {
    const startAt = badger.clock.now() + 60 * MINUTE;
    const task = await badger.whenTaskCreated('water plants', startAt, daily);
    await badger.whenSyncRuns();

    await badger.whenTaskCompleted(task.id);
    await badger.whenSyncRuns();

    expect(badger.server.receivedCompletions).toEqual([task.id]);
    const spawnedCreate = badger.server.receivedCreates[badger.server.receivedCreates.length - 1];
    expect(spawnedCreate.seriesId).toBe(task.id);
    badger.thenServerHasOpenTask('water plants');
    const active = await badger.taskDao.getActive();
    expect(active.length).toBe(1);
    expect(active[0].pendingCreate).toBe(false);
  });

  it('completing twice spawns only one next occurrence', async () => {
    badger.givenOffline();
    const startAt = badger.clock.now() + 60 * MINUTE;
    const task = await badger.whenTaskCreated('water plants', startAt, daily);

    await badger.whenTaskCompleted(task.id);
    await badger.whenTaskCompleted(task.id);

    expect((await badger.taskDao.getActive()).length).toBe(1);
  });

  it('completing long after missed occurrences spawns exactly one future one', async () => {
    badger.givenOffline();
    const startAt = badger.clock.now() + 60 * MINUTE;
    const task = await badger.whenTaskCreated('water plants', startAt, daily);
    badger.whenTimeAdvancesMinutes(5 * 24 * 60); // five missed days

    await badger.whenTaskCompleted(task.id);

    const active = await badger.taskDao.getActive();
    expect(active.length).toBe(1);
    const spawned = active[0];
    expect(spawned.firstWarningAtMillis).not.toBeNull();
    expect(spawned.firstWarningAtMillis!, 'next occurrence must be in the future').toBeGreaterThan(
      badger.clock.now(),
    );
    expect(spawned.firstWarningAtMillis).toBe(
      computeNextOccurrence(startAt, daily, badger.clock.now()),
    );
  });

  it('a recurring task pulled from another device spawns on completion', async () => {
    const startAt = badger.clock.now() + 60 * MINUTE;
    const dto = badger.server.seedOpenTask({
      title: 'water plants',
      firstWarningAtMillis: startAt,
      recurEveryN: 1,
      recurUnit: 'days',
      seriesId: 'series-1',
    });
    await badger.whenSyncRuns();

    await badger.whenTaskCompleted(dto.id);

    const active = await badger.taskDao.getActive();
    expect(active.length).toBe(1);
    expect(active[0].seriesId).toBe('series-1');
    expect(active[0].firstWarningAtMillis).toBe(startAt + day);
  });

  it('a spawned occurrence survives a pull that does not list it yet', async () => {
    badger.givenOffline();
    const startAt = badger.clock.now() + 60 * MINUTE;
    const task = await badger.whenTaskCreated('water plants', startAt, daily);
    await badger.whenTaskCompleted(task.id);

    badger.givenOnline();
    badger.server.failCreatesWithServerError = true;
    await badger.whenSyncRuns(); // create push fails, pull runs without the spawn

    const active = await badger.taskDao.getActive();
    expect(active.length).toBe(1);
    expect(active[0].pendingCreate, 'unpushed spawn must survive the pull').toBe(true);
    expect(active[0].firstWarningAtMillis).toBe(startAt + day);
  });
});
