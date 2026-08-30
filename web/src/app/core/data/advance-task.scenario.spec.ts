import { recurrenceOf } from '../domain/models';
import { BadgerScenario, MINUTE } from '../testing/badger-scenario';

// Ported from AdvanceTaskScenarios.kt.
//
// Advancing pulls a scheduled occurrence to now without moving the series: the
// cadence stays anchored on the occurrence's own start time, not on the moment
// the user got impatient.
describe('advancing a scheduled task', () => {
  let badger: BadgerScenario;
  const day = 24 * 60 * MINUTE;

  beforeEach(() => {
    badger = new BadgerScenario();
  });

  const tomorrowAt9 = (): number => badger.clock.now() + day + 9 * 60 * MINUTE;

  /** Weekly on whatever local weekday [atMillis] falls on (bit 0 = Monday). */
  const weeklyOn = (atMillis: number) =>
    recurrenceOf(1, 'weeks', 1 << ((new Date(atMillis).getDay() + 6) % 7));

  it('starts the task nagging now', async () => {
    const task = await badger.whenTaskCreated('water plants', tomorrowAt9());

    await badger.whenTaskAdvanced(task.id);

    const advanced = await badger.localTask(task.id);
    expect(advanced.firstWarningAtMillis).toBe(badger.clock.now());
    expect(advanced.nextFireAtMillis).toBe(badger.clock.now());
    expect(advanced.pendingUpdate, 'the schedule change must reach the server').toBe(true);
    badger.thenAlarmScheduledAt(task.id, badger.clock.now());
  });

  it('moves a weekly series to next week, not a week from today', async () => {
    const startAt = tomorrowAt9();
    const task = await badger.whenTaskCreated('water plants', startAt, weeklyOn(startAt));

    await badger.whenTaskAdvanced(task.id);

    const spawned = (await badger.taskDao.getActive()).find((row) => row.id !== task.id)!;
    const spawnedAt = new Date(spawned.firstWarningAtMillis!);
    const start = new Date(startAt);
    expect(spawnedAt.getDay(), 'must stay on the series weekday').toBe(start.getDay());
    expect(spawnedAt.getHours(), "must keep the series' time of day").toBe(start.getHours());
    expect(spawned.firstWarningAtMillis! - startAt).toBeGreaterThan(6 * day);
    expect(spawned.firstWarningAtMillis! - startAt).toBeLessThan(8 * day);
    expect(spawnedAt.getDay(), 'the series must not re-anchor on today').not.toBe(
      new Date(badger.clock.now()).getDay(),
    );
    expect(spawned.title).toBe('water plants');
    expect(spawned.seriesId).toBe(task.seriesId);
    expect(spawned.pendingCreate).toBe(true);
    badger.thenAlarmScheduledAt(spawned.id, spawned.firstWarningAtMillis!);
  });

  it('keeps the advanced occurrence in its series but drops the rule', async () => {
    const startAt = tomorrowAt9();
    const task = await badger.whenTaskCreated('water plants', startAt, weeklyOn(startAt));

    await badger.whenTaskAdvanced(task.id);

    const advanced = await badger.localTask(task.id);
    expect(advanced.seriesId, 'history must still tie back to the series').toBe(task.seriesId);
    expect(advanced.recurEveryN).toBeNull();
    expect(advanced.recurUnit).toBeNull();
    expect(advanced.recurDaysOfWeek).toBeNull();
  });

  it('spawns nothing further when the advanced occurrence is completed', async () => {
    const startAt = tomorrowAt9();
    const task = await badger.whenTaskCreated('water plants', startAt, weeklyOn(startAt));
    await badger.whenTaskAdvanced(task.id);
    const spawned = (await badger.taskDao.getActive()).find((row) => row.id !== task.id)!;

    await badger.whenTaskCompleted(task.id);

    expect(
      (await badger.taskDao.getActive()).map((row) => row.id),
      'only the already-spawned occurrence may remain',
    ).toEqual([spawned.id]);
    await badger.thenCompletionCached('water plants', null, false);
  });

  it('spawns no occurrence for a one-off scheduled task', async () => {
    const task = await badger.whenTaskCreated('call the vet', tomorrowAt9());

    await badger.whenTaskAdvanced(task.id);

    expect((await badger.taskDao.getActive()).map((row) => row.id)).toEqual([task.id]);
  });

  it('changes nothing for a task that is already nagging', async () => {
    const startAt = tomorrowAt9();
    const task = await badger.whenTaskCreated('water plants', startAt, weeklyOn(startAt));
    badger.whenTimeAdvancesMinutes(2 * 24 * 60); // past the first occurrence

    await badger.whenTaskAdvanced(task.id);

    const unchanged = await badger.localTask(task.id);
    expect(unchanged.firstWarningAtMillis).toBe(startAt);
    expect(unchanged.recurEveryN).toBe(1);
    expect(
      (await badger.taskDao.getActive()).map((row) => row.id),
      'an already-nagging task must not spawn a second occurrence',
    ).toEqual([task.id]);
  });

  it('pushes both the advanced occurrence and the next one on sync', async () => {
    const startAt = tomorrowAt9();
    const task = await badger.whenTaskCreated('water plants', startAt, weeklyOn(startAt));
    await badger.whenSyncRuns();
    badger.server.receivedCreates.length = 0;

    await badger.whenTaskAdvanced(task.id);
    await badger.whenSyncRuns();

    expect(badger.server.receivedScheduleUpdates.length).toBe(1);
    const [updatedId, update] = badger.server.receivedScheduleUpdates[0];
    expect(updatedId).toBe(task.id);
    expect(update.recurEveryN, 'the rule moved to the next occurrence').toBeNull();
    expect(badger.server.receivedCreates.length).toBe(1);
    const spawnedCreate = badger.server.receivedCreates[0];
    expect(spawnedCreate.recurEveryN).toBe(1);
    expect(spawnedCreate.seriesId).toBe(task.seriesId);
  });
});
