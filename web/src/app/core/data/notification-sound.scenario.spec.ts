import { BadgerScenario } from '../testing/badger-scenario';
import { NotificationSound, SILENT, SYSTEM_DEFAULT, builtIn } from '../domain/notification-sound';

// Ported from NotificationSoundScenarios.kt.
describe('notification sound', () => {
  let badger: BadgerScenario;

  beforeEach(() => {
    badger = new BadgerScenario();
  });

  it('a fresh install nags with the system sound', async () => {
    await badger.givenLocalSettings(60, 15);
    badger.givenOffline();
    const task = await badger.whenTaskCreated('water plants');
    badger.whenTimeAdvancesMinutes(60);

    await badger.whenReminderFires(task.id);

    expect(badger.alarms.shownReminders.map((r) => r.sound)).toEqual([SYSTEM_DEFAULT]);
  });

  it('the next nag rings with the chosen sound', async () => {
    await badger.givenLocalSettings(60, 15);
    badger.givenOffline();
    const task = await badger.whenTaskCreated('water plants');
    badger.whenTimeAdvancesMinutes(60);

    await badger.whenNotificationSoundChosen(builtIn('simple-01'));
    await badger.whenReminderFires(task.id);

    expect(badger.alarms.shownReminders.map((r) => r.sound)).toEqual([builtIn('simple-01')]);
  });

  it('an uploaded sound is the one that rings', async () => {
    const picked: NotificationSound = {
      kind: 'custom',
      uri: 'data:audio/mpeg;base64,SUQz',
      label: 'pixie-dust.mp3',
    };
    await badger.givenLocalSettings(60, 15);
    await badger.givenNotificationSound(picked);
    badger.givenOffline();
    const task = await badger.whenTaskCreated('water plants');
    badger.whenTimeAdvancesMinutes(60);

    await badger.whenReminderFires(task.id);

    expect(badger.alarms.shownReminders.map((r) => r.sound)).toEqual([picked]);
  });

  it('silent still nags, it only drops the sound', async () => {
    await badger.givenLocalSettings(60, 15);
    await badger.givenNotificationSound(SILENT);
    badger.givenOffline();
    const task = await badger.whenTaskCreated('water plants');
    badger.whenTimeAdvancesMinutes(60);

    await badger.whenReminderFires(task.id);

    const [shown] = badger.alarms.shownReminders;
    expect(badger.alarms.shownReminders.length).toBe(1);
    expect(shown.task.id).toBe(task.id);
    expect(shown.sound).toEqual(SILENT);
  });

  it('the test notification rings with the chosen sound', async () => {
    await badger.givenNotificationSound(builtIn('ambient'));
    badger.givenOffline();

    await badger.whenTestNotificationRequested();

    expect(badger.alarms.testNotificationSounds).toEqual([builtIn('ambient')]);
  });

  it('choosing a sound stays on this device', async () => {
    badger.givenOnline();

    await badger.whenNotificationSoundChosen(builtIn('high-intensity'));
    await badger.whenSyncRuns();

    expect(await badger.settingsStore.isSettingsDirty()).toBe(false);
    badger.thenNothingPushed();
  });

  it('a settings pull leaves the chosen sound alone', async () => {
    await badger.givenNotificationSound(builtIn('decorative-01'));
    badger.server.settings = {
      initialDelayMinutes: 45,
      repeatIntervalMinutes: 20,
      waitMinutes: [120, 480],
      defaultWaitIndex: 1,
      quietHours: [],
    };

    await badger.whenSyncRuns();

    expect((await badger.settingsStore.current()).notificationSound).toBe('builtin:decorative-01');
  });
});
