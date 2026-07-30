import { NetworkError } from '../domain/errors';
import { toIsoInstant } from '../domain/time';
import { BadgerScenario, MINUTE } from '../testing/badger-scenario';

// Ported from EditScheduleScenarios.kt.
describe('editing a task schedule', () => {
  let badger: BadgerScenario;
  const minute = MINUTE;

  beforeEach(() => {
    badger = new BadgerScenario();
  });

  it('editing the start time reschedules the alarm and pushes the update', async () => {
    const task = await badger.givenSyncedTask('water plants');
    const newStart = badger.clock.now() + 3 * 24 * 60 * minute;

    await badger.whenScheduleEdited(task.id, newStart, task.repeatIntervalMinutes);

    badger.thenAlarmScheduledAt(task.id, newStart);
    expect((await badger.localTask(task.id)).pendingUpdate).toBe(true);

    await badger.whenSyncRuns();
    expect(badger.server.receivedScheduleUpdates.length).toBe(1);
    const [updatedId, request] = badger.server.receivedScheduleUpdates[0];
    expect(updatedId).toBe(task.id);
    expect(request.firstWarningAt).toBe(toIsoInstant(newStart));
    expect((await badger.localTask(task.id)).pendingUpdate).toBe(false);
  });

  it('clearing the start time falls back to the normal nag cadence', async () => {
    const startAt = badger.clock.now() + 24 * 60 * minute;
    const task = await badger.whenTaskCreated('water plants', startAt);

    await badger.whenScheduleEdited(task.id, null, task.repeatIntervalMinutes);

    expect((await badger.localTask(task.id)).firstWarningAtMillis).toBeNull();
    // Back to createdAt + initialDelay (60m default).
    badger.thenAlarmScheduledAt(task.id, task.createdAtMillis + 60 * minute);
  });

  it('changing the nag interval re-arms the alarm and future repeats', async () => {
    const task = await badger.givenSyncedTask('water plants');
    badger.whenTimeAdvancesMinutes(70); // past the first fire: task is actively nagging

    await badger.whenScheduleEdited(task.id, null, 60);

    const edited = await badger.localTask(task.id);
    expect(edited.repeatIntervalMinutes).toBe(60);
    const armedAt = badger.alarms.scheduled.get(task.id)!;
    expect(armedAt, 'next fire must be in the future').toBeGreaterThan(badger.clock.now());

    badger.whenTimeAdvancesMinutes(Math.trunc((armedAt - badger.clock.now()) / minute));
    await badger.whenReminderFires(task.id);
    badger.thenAlarmScheduledAt(task.id, badger.clock.now() + 60 * minute);
  });

  it('an offline edit keeps its flag through a failed sync and flushes later', async () => {
    const task = await badger.givenSyncedTask('water plants');
    const newStart = badger.clock.now() + 24 * 60 * minute;

    badger.givenOffline();
    await badger.whenScheduleEdited(task.id, newStart, task.repeatIntervalMinutes);
    await badger.whenSyncFailsWith((error) => error instanceof NetworkError);
    expect((await badger.localTask(task.id)).pendingUpdate).toBe(true);

    badger.givenOnline();
    await badger.whenSyncRuns();
    expect((await badger.localTask(task.id)).pendingUpdate).toBe(false);
    expect(badger.server.receivedScheduleUpdates.length).toBe(1);
  });

  it('editing a task whose create response was lost repairs the server', async () => {
    badger.givenOffline();
    const task = await badger.whenTaskCreated('water plants');

    // The create reaches the server but the response is lost.
    badger.givenOnline();
    badger.server.dropCreateResponses = true;
    await badger.whenSyncFailsWith((error) => error instanceof NetworkError);
    expect((await badger.localTask(task.id)).pendingCreate).toBe(true);

    const newStart = badger.clock.now() + 24 * 60 * minute;
    await badger.whenScheduleEdited(task.id, newStart, 30);

    badger.server.dropCreateResponses = false;
    await badger.whenSyncRuns();

    // The re-pushed create was ignored idempotently; the PUT repaired it.
    const serverTask = badger.server.tasks.get(task.id)!;
    expect(serverTask.firstWarningAt).toBe(toIsoInstant(newStart));
    expect(serverTask.repeatIntervalMinutes).toBe(30);
    const local = await badger.localTask(task.id);
    expect(local.pendingCreate).toBe(false);
    expect(local.pendingUpdate).toBe(false);
  });

  it('an edit for a task deleted elsewhere is dropped and the row pruned', async () => {
    const task = await badger.givenSyncedTask('water plants');
    badger.server.tasks.clear(); // deleted on the server by another device

    await badger.whenScheduleEdited(
      task.id,
      badger.clock.now() + 24 * 60 * minute,
      task.repeatIntervalMinutes,
    );
    await badger.whenSyncRuns();

    await badger.thenTaskGone('water plants');
    expect(badger.server.receivedScheduleUpdates).toEqual([]);
  });

  it('a schedule edited on another device is adopted on pull', async () => {
    const task = await badger.givenSyncedTask('water plants');
    const remoteStart = badger.clock.now() + 48 * 60 * minute;
    badger.server.tasks.set(task.id, {
      ...badger.server.tasks.get(task.id)!,
      firstWarningAt: toIsoInstant(remoteStart),
      repeatIntervalMinutes: 45,
      recurEveryN: 1,
      recurUnit: 'days',
      seriesId: task.id,
    });

    await badger.whenSyncRuns();

    const pulled = await badger.localTask(task.id);
    expect(pulled.firstWarningAtMillis).toBe(remoteStart);
    expect(pulled.repeatIntervalMinutes).toBe(45);
    expect(pulled.recurEveryN).toBe(1);
    badger.thenAlarmScheduledAt(task.id, remoteStart);
  });

  it('a local unpushed edit wins over the server copy on pull', async () => {
    const task = await badger.givenSyncedTask('water plants');
    const localStart = badger.clock.now() + 24 * 60 * minute;

    badger.givenOffline();
    await badger.whenScheduleEdited(task.id, localStart, task.repeatIntervalMinutes);

    badger.givenOnline();
    badger.server.tasks.set(task.id, {
      ...badger.server.tasks.get(task.id)!,
      firstWarningAt: toIsoInstant(badger.clock.now() + 99 * 60 * minute),
    });
    await badger.whenSyncRuns();

    // The push wins: our edit reached the server, the stale server copy never
    // overwrote the local row.
    expect((await badger.localTask(task.id)).firstWarningAtMillis).toBe(localStart);
    expect(badger.server.tasks.get(task.id)!.firstWarningAt).toBe(toIsoInstant(localStart));
  });

  it('a snooze survives a pull whose schedule is unchanged', async () => {
    const task = await badger.givenSyncedTask('water plants');
    await badger.whenSnoozed(task.id, 90);
    const snoozedUntil = badger.clock.now() + 90 * minute;
    badger.thenAlarmScheduledAt(task.id, snoozedUntil);

    await badger.whenSyncRuns();

    expect((await badger.localTask(task.id)).nextFireAtMillis).toBe(snoozedUntil);
    badger.thenAlarmScheduledAt(task.id, snoozedUntil);
  });

  it('a snooze until an exact time also survives a pull whose schedule is unchanged', async () => {
    const task = await badger.givenSyncedTask('water plants');
    const snoozedUntil = badger.clock.now() + 17 * 60 * minute;
    await badger.whenSnoozedUntil(task.id, snoozedUntil);

    await badger.whenSyncRuns();

    expect((await badger.localTask(task.id)).nextFireAtMillis).toBe(snoozedUntil);
    badger.thenAlarmScheduledAt(task.id, snoozedUntil);
  });
});
