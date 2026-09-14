import { BadgerScenario, MINUTE } from '../testing/badger-scenario';

// Ported from TestNotificationScenarios.kt.
//
// The Kotlin suite also covers the pause, quiet hours and the minimum
// notification gap holding no sway over the test notification. Those gates do
// not exist in the web repository yet, so their scenarios have no counterpart
// here; the ones below are the parts that do apply.
describe('the test notification', () => {
  let badger: BadgerScenario;

  beforeEach(() => {
    badger = new BadgerScenario();
  });

  it('carries the configured default wait', async () => {
    await badger.givenLocalSettings(60, 15, [30, 120], 1);
    badger.givenOffline();

    await badger.whenTestNotificationRequested();

    expect(badger.alarms.testNotifications).toEqual([120]);
  });

  it('never delays a real nag', async () => {
    await badger.givenLocalSettings(60, 15);
    badger.givenOffline();
    const task = await badger.whenTaskCreated('water plants');
    const armedFor = badger.clock.now() + 60 * MINUTE;

    await badger.whenTestNotificationRequested();

    // Nothing about the schedule moved, and no reminder was shown: the test
    // notification is a delivery check, not a nag.
    expect((await badger.localTask(task.id)).nextFireAtMillis).toBe(armedFor);
    badger.thenAlarmScheduledAt(task.id, armedFor);
    expect(badger.alarms.shownReminders).toEqual([]);
    badger.thenNothingPushed();
  });
});
