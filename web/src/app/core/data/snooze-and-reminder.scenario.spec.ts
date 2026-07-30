import { BadgerScenario, MINUTE } from '../testing/badger-scenario';

// Ported from SnoozeAndReminderScenarios.kt.
describe('snoozing and reminders', () => {
  let badger: BadgerScenario;

  beforeEach(() => {
    badger = new BadgerScenario();
  });

  it('a snooze pushes the next nag out, dismisses the notification and never touches the server', async () => {
    await badger.givenLocalSettings(60, 15, [90, 300]);
    badger.givenOffline();
    const task = await badger.whenTaskCreated('water plants');

    await badger.whenSnoozed(task.id, 90);

    expect((await badger.localTask(task.id)).nextFireAtMillis).toBe(
      badger.clock.now() + 90 * MINUTE,
    );
    badger.thenAlarmScheduledAt(task.id, badger.clock.now() + 90 * MINUTE);
    expect(badger.alarms.dismissed).toContain(task.id);
    badger.thenNothingPushed();
  });

  it('any configured wait works the same way, however far out it reaches', async () => {
    await badger.givenLocalSettings(60, 15, [15, 90, 300, 480]);
    badger.givenOffline();
    const task = await badger.whenTaskCreated('water plants');

    await badger.whenSnoozed(task.id, 480);

    expect((await badger.localTask(task.id)).nextFireAtMillis).toBe(
      badger.clock.now() + 480 * MINUTE,
    );
    badger.thenAlarmScheduledAt(task.id, badger.clock.now() + 480 * MINUTE);
    badger.thenNothingPushed();
  });

  it('snoozing until an exact time parks the nag there without rewriting the schedule', async () => {
    badger.givenOffline();
    const task = await badger.whenTaskCreated('water plants');
    const tomorrowMorning = badger.clock.now() + 17 * 60 * MINUTE;

    await badger.whenSnoozedUntil(task.id, tomorrowMorning);

    const snoozed = await badger.localTask(task.id);
    expect(snoozed.nextFireAtMillis).toBe(tomorrowMorning);
    // The task itself is untouched: same start time, same nag interval.
    expect(snoozed.firstWarningAtMillis).toBe(task.firstWarningAtMillis);
    expect(snoozed.repeatIntervalMinutes).toBe(task.repeatIntervalMinutes);
    badger.thenAlarmScheduledAt(task.id, tomorrowMorning);
    expect(badger.alarms.dismissed).toContain(task.id);
    badger.thenNothingPushed();
  });

  it('snoozing until a time in the past is ignored rather than firing instantly', async () => {
    badger.givenOffline();
    const task = await badger.whenTaskCreated('water plants');

    await badger.whenSnoozedUntil(task.id, badger.clock.now() - 5 * MINUTE);

    expect((await badger.localTask(task.id)).nextFireAtMillis).toBe(task.nextFireAtMillis);
  });

  it("a snooze survives a sync - the local nag time is preserved over the server's view", async () => {
    const task = await badger.givenSyncedTask('water plants');

    await badger.whenSnoozed(task.id, 30);
    await badger.whenSyncRuns();

    expect((await badger.localTask(task.id)).nextFireAtMillis).toBe(
      badger.clock.now() + 30 * MINUTE,
    );
    badger.thenAlarmScheduledAt(task.id, badger.clock.now() + 30 * MINUTE);
  });

  it('a task pulled long after its first warning lands on the next repeat slot in the future', async () => {
    // Created 100 min ago, first fire at +60, repeating every 15: slots at
    // +60/+75/+90/+105 — the next one in the future is 5 min from now.
    badger.server.seedOpenTask({
      title: 'old task',
      createdAtMillis: badger.clock.now() - 100 * MINUTE,
      initialDelayMinutes: 60,
      repeatIntervalMinutes: 15,
    });

    await badger.whenSyncRuns();

    const active = await badger.taskDao.getActive();
    expect(active.length).toBe(1);
    expect(active[0].nextFireAtMillis).toBe(badger.clock.now() + 5 * MINUTE);
  });

  it('when a reminder fires it offers the default wait and schedules the next repeat', async () => {
    // The notification's one-tap button uses the wait the user marked default,
    // which is not necessarily the first one in the list.
    await badger.givenLocalSettings(60, 15, [15, 45, 120], 1);
    badger.givenOffline();
    const task = await badger.whenTaskCreated('water plants');
    badger.whenTimeAdvancesMinutes(60);

    await badger.whenReminderFires(task.id);

    expect(badger.alarms.shownReminders.length).toBe(1);
    const shown = badger.alarms.shownReminders[0];
    expect(shown.task.id).toBe(task.id);
    expect(shown.defaultWaitMinutes).toBe(45);
    expect((await badger.localTask(task.id)).nextFireAtMillis).toBe(
      badger.clock.now() + 15 * MINUTE,
    );
    badger.thenAlarmScheduledAt(task.id, badger.clock.now() + 15 * MINUTE);
  });

  it('an out-of-range default index falls back to the first wait instead of crashing', async () => {
    // A stale default can outlive the wait it pointed at, e.g. a shorter list
    // arriving from another device.
    await badger.givenLocalSettings(60, 15, [20, 90], 5);
    badger.givenOffline();
    const task = await badger.whenTaskCreated('water plants');
    badger.whenTimeAdvancesMinutes(60);

    await badger.whenReminderFires(task.id);

    expect(badger.alarms.shownReminders.length).toBe(1);
    expect(badger.alarms.shownReminders[0].defaultWaitMinutes).toBe(20);
  });

  it('a stale alarm for an already-completed task shows nothing and stops the chain', async () => {
    badger.givenOffline();
    const task = await badger.whenTaskCreated('water plants');
    await badger.whenTaskCompleted(task.id);

    await badger.whenReminderFires(task.id);

    expect(badger.alarms.shownReminders, 'no nag for a completed task').toEqual([]);
    badger.thenNoAlarmArmed(task.id);
  });
});
