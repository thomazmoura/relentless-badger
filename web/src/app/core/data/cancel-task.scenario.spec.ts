import { buildMonthEntries } from '../domain/calendar-entries';
import { recurrenceOf } from '../domain/models';
import {
  atDay,
  plusMonths,
  startOfDay,
  systemZone,
  toIsoInstant,
  yearMonthOf,
} from '../domain/time';
import { BadgerScenario, MINUTE } from '../testing/badger-scenario';

// Ported from CancelTaskScenarios.kt.
describe('cancelling a task', () => {
  let badger: BadgerScenario;

  beforeEach(() => {
    badger = new BadgerScenario();
  });

  it('cancelling closes the task and stops the nagging, flagged as not done', async () => {
    const task = await badger.givenSyncedTask('water plants');

    await badger.whenTaskCancelled(task.id);

    await badger.thenTaskGone('water plants');
    expect(badger.alarms.cancelled).toContain(task.id);
    await badger.thenCompletionCached('water plants', badger.clock.now(), true);
  });

  it('completing still records the task as done', async () => {
    const task = await badger.givenSyncedTask('water plants');

    await badger.whenTaskCompleted(task.id);
    await badger.whenSyncRuns();

    await badger.thenCompletionCached('water plants', null, false);
    expect(badger.server.tasks.get(task.id)!.cancelled, 'done, not cancelled').toBe(false);
  });

  it('a cancellation made offline reaches the server flagged, with the local cancel time', async () => {
    const task = await badger.givenSyncedTask('water plants');
    badger.givenOffline();

    await badger.whenTaskCancelled(task.id);
    const cancelledAtMillis = badger.clock.now();

    badger.whenTimeAdvancesMinutes(90);
    badger.givenOnline();
    await badger.whenSyncRuns();

    expect(badger.server.receivedCompletions).toEqual([task.id]);
    const pushed = badger.server.tasks.get(task.id)!;
    expect(pushed.cancelled, 'server records it as cancelled').toBe(true);
    expect(pushed.completedAt, 'server records the local cancel time, not the sync time').toBe(
      toIsoInstant(cancelledAtMillis),
    );
    expect(await badger.taskDao.getById(task.id), 'row removed once acknowledged').toBeNull();
  });

  it('cancelling an occurrence keeps the recurring series alive', async () => {
    const day = 24 * 60 * MINUTE;
    const startAt = badger.clock.now() + 60 * MINUTE;
    const task = await badger.whenTaskCreated('water plants', startAt, recurrenceOf(1, 'days'));
    badger.whenTimeAdvancesMinutes(90); // past the first occurrence

    await badger.whenTaskCancelled(task.id);

    const active = await badger.taskDao.getActive();
    expect(active.length).toBe(1);
    const spawned = active[0];
    expect(spawned.title).toBe('water plants');
    expect(spawned.firstWarningAtMillis).toBe(startAt + day);
    expect(spawned.seriesId).toBe(task.id);
    badger.thenAlarmScheduledAt(spawned.id, startAt + day);
    await badger.thenCompletionCached('water plants', null, true);
  });

  it('the calendar reads a cancellation back through the store and can show it', async () => {
    const task = await badger.givenSyncedTask('water plants');

    await badger.whenTaskCancelled(task.id);
    await badger.whenSyncRuns();

    // Exactly the path the calendar screen uses: the month query, then
    // bucketing — so a wrong field mapping or a lost flag shows up here.
    const zone = systemZone();
    const month = yearMonthOf(badger.clock.now(), zone);
    const completed = await badger.repository.completedTasksBetween(
      startOfDay(atDay(month, 1), zone),
      startOfDay(atDay(plusMonths(month, 1), 1), zone),
    );
    expect(completed.map((row) => row.cancelled)).toEqual([true]);

    const hidden = buildMonthEntries([], completed, month, zone);
    expect(hidden.size, 'hidden by default').toBe(0);

    const shown = buildMonthEntries([], completed, month, zone, true);
    expect([...shown.values()].flat().map((entry) => entry.kind)).toEqual(['cancelled']);
  });

  it('a cancellation pulled from another device is cached as cancelled', async () => {
    badger.givenServerHasCompletedTask('water plants', badger.clock.now(), true);

    await badger.whenSyncRuns();

    await badger.thenCompletionCached('water plants', null, true);
  });
});
