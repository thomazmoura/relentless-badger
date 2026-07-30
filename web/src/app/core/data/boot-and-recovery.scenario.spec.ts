import { BadgerScenario, MINUTE } from '../testing/badger-scenario';

// Ported from BootAndRecoveryScenarios.kt. On the web "reboot" is the app being
// closed and reopened, which loses the in-page timers the same way.
describe('recovering after a restart', () => {
  let badger: BadgerScenario;

  beforeEach(() => {
    badger = new BadgerScenario();
  });

  it("after a restart every open task's reminder is re-armed at its stored time", async () => {
    badger.givenOffline();
    const a = await badger.whenTaskCreated('water plants');
    const b = await badger.whenTaskCreated('walk dog', badger.clock.now() + 300 * MINUTE);
    badger.alarms.scheduled.clear(); // restart: all timers lost

    await badger.whenBootReArmRuns();

    badger.thenAlarmScheduledAt(a.id, a.nextFireAtMillis);
    badger.thenAlarmScheduledAt(b.id, b.nextFireAtMillis);
  });

  it('a fire time missed while the app was closed is nudged a minute into the future', async () => {
    badger.givenOffline();
    const task = await badger.whenTaskCreated('water plants'); // fires at +60 min
    badger.alarms.scheduled.clear();
    badger.whenTimeAdvancesMinutes(90); // app was closed past the fire time

    await badger.whenBootReArmRuns();

    expect((await badger.localTask(task.id)).nextFireAtMillis).toBe(badger.clock.now() + MINUTE);
    badger.thenAlarmScheduledAt(task.id, badger.clock.now() + MINUTE);
  });
});
