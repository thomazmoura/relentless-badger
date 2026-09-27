import { BadgerScenario } from '../testing/badger-scenario';
import { stringsOf } from '../i18n/strings';

// Ported from LanguageScenarios.kt.
describe('language', () => {
  let badger: BadgerScenario;

  beforeEach(() => {
    badger = new BadgerScenario();
  });

  it('a fresh install on an English device nags in English', async () => {
    badger.givenDeviceLanguage('en-US');
    await badger.givenLocalSettings(60, 15);
    badger.givenOffline();
    const task = await badger.whenTaskCreated('water plants');
    badger.whenTimeAdvancesMinutes(60);

    await badger.whenReminderFires(task.id);

    const [shown] = badger.alarms.shownReminders;
    expect(shown.language).toBe('en');
    expect(stringsOf(shown.language).notificationTitle(shown.task.title)).toBe(
      'Badger: water plants',
    );
  });

  it('a fresh install on a Portuguese device nags in Portuguese', async () => {
    badger.givenDeviceLanguage('pt-BR');
    await badger.givenLocalSettings(60, 15);
    badger.givenOffline();
    const task = await badger.whenTaskCreated('regar as plantas');
    badger.whenTimeAdvancesMinutes(60);

    await badger.whenReminderFires(task.id);

    const [shown] = badger.alarms.shownReminders;
    expect(shown.language).toBe('pt');
    expect(stringsOf(shown.language).notificationTitle(shown.task.title)).toBe(
      'Texugo: regar as plantas',
    );
  });

  it('a chosen language overrides the device', async () => {
    badger.givenDeviceLanguage('pt-BR');
    await badger.givenLocalSettings(60, 15);
    badger.givenOffline();
    const task = await badger.whenTaskCreated('water plants');
    badger.whenTimeAdvancesMinutes(60);

    await badger.whenLanguageChosen('en');
    await badger.whenReminderFires(task.id);

    expect(badger.alarms.shownReminders.map((r) => r.language)).toEqual(['en']);
  });

  it('device default follows the device when its language changes', async () => {
    badger.givenDeviceLanguage('en-US');
    await badger.givenLanguage('system');
    badger.givenOffline();

    badger.givenDeviceLanguage('pt-PT');
    await badger.whenTestNotificationRequested();

    expect(badger.alarms.testNotificationLanguages).toEqual(['pt']);
  });

  it('choosing a language stays on this device', async () => {
    badger.givenOnline();

    await badger.whenLanguageChosen('pt');
    await badger.whenSyncRuns();

    expect(await badger.settingsStore.isSettingsDirty()).toBe(false);
    badger.thenNothingPushed();
  });

  it('a settings pull leaves the chosen language alone', async () => {
    await badger.givenLanguage('pt');
    badger.server.settings = {
      initialDelayMinutes: 45,
      repeatIntervalMinutes: 20,
      waitMinutes: [120, 480],
      defaultWaitIndex: 1,
      quietHours: [],
    };

    await badger.whenSyncRuns();

    expect((await badger.settingsStore.current()).language).toBe('pt');
  });
});
