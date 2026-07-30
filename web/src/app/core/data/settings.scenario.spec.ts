import { ApiError } from '../domain/errors';
import { SettingsDto } from '../domain/models';
import { BadgerScenario } from '../testing/badger-scenario';

// Ported from SettingsScenarios.kt.
describe('settings', () => {
  let badger: BadgerScenario;

  beforeEach(() => {
    badger = new BadgerScenario();
  });

  const settings = (
    initialDelayMinutes: number,
    repeatIntervalMinutes: number,
    waitMinutes: number[],
    defaultWaitIndex: number,
    quietHours: string[] = [],
  ): SettingsDto => ({
    initialDelayMinutes,
    repeatIntervalMinutes,
    waitMinutes,
    defaultWaitIndex,
    quietHours,
  });

  it('settings saved offline take effect immediately and are pushed when connectivity returns', async () => {
    badger.givenOffline();

    await badger.whenSettingsSaved(settings(30, 5, [15, 90, 300, 480], 2));

    // Immediately effective: a new task snapshots the new values.
    const task = await badger.whenTaskCreated('water plants');
    expect(task.initialDelayMinutes).toBe(30);
    expect(task.repeatIntervalMinutes).toBe(5);
    expect(badger.settingsStore.dirty, 'flagged for push').toBe(true);
    badger.thenNothingPushed();

    badger.givenOnline();
    await badger.whenSyncRuns();

    expect(badger.server.receivedSettingsPuts).toEqual([settings(30, 5, [15, 90, 300, 480], 2)]);
    expect(badger.server.settings).toEqual(settings(30, 5, [15, 90, 300, 480], 2));
    expect(badger.settingsStore.dirty, 'flag cleared once acknowledged').toBe(false);
  });

  it("unpushed local settings are not overwritten by the server's copy", async () => {
    badger.server.settings = settings(10, 10, [10, 10], 0);
    badger.server.failSettingsPush = true;

    await badger.whenSettingsSaved(settings(30, 5, [15, 90, 300, 480], 2));
    await badger.whenSyncFailsWith((error) => error instanceof ApiError);

    expect(badger.settingsStore.settings, 'local edit survives').toEqual(
      settings(30, 5, [15, 90, 300, 480], 2),
    );
    expect(badger.settingsStore.dirty, 'still flagged for push').toBe(true);
  });

  it('with no local edits, settings changed on the server flow down on sync', async () => {
    badger.server.settings = settings(45, 20, [120, 480], 1);

    await badger.whenSyncRuns();

    expect(badger.settingsStore.settings).toEqual(settings(45, 20, [120, 480], 1));
  });

  it('changing the server URL rewrites it but keeps the session and local data', async () => {
    await badger.givenSyncedTask('water plants');
    badger.givenOffline();
    await badger.whenTaskCreated('buy milk'); // stays pendingCreate
    const savedSettings = badger.settingsStore.settings;
    const syncRequestsBefore = badger.syncRequests.requests;

    await badger.whenServerUrlChanged('https://new.badger.test/');

    expect(badger.settingsStore.baseUrl, 'normalized (trailing slash trimmed)').toBe(
      'https://new.badger.test',
    );
    await badger.thenTaskVisible('water plants');
    await badger.thenTaskVisible('buy milk');
    expect((await badger.localTaskByTitle('buy milk')).pendingCreate, 'pending work survives').toBe(
      true,
    );
    expect(badger.alarms.cancelled, 'no alarms cancelled').toEqual([]);
    expect(badger.settingsStore.settings, 'settings untouched').toEqual(savedSettings);
    expect((await badger.settingsStore.current()).token, 'still signed in').toBe('test-jwt');
    expect(badger.syncRequests.requests, 'one sync requested').toBe(syncRequestsBefore + 1);
  });

  it('a blank server URL is rejected and nothing changes', async () => {
    await badger.whenServerUrlChangeFailsWith('   /');

    expect(badger.settingsStore.baseUrl).toBe('http://badger.test');
  });

  it('a malformed server URL is rejected and nothing changes', async () => {
    await badger.whenServerUrlChangeFailsWith('not a url');

    expect(badger.settingsStore.baseUrl).toBe('http://badger.test');
  });

  // Quiet hours are an Android feature, but they are account settings: this
  // client has to carry them or saving here would wipe them off the phone.
  it('quiet hours set on another client survive a save here', async () => {
    badger.server.settings = settings(45, 20, [120, 480], 1, ['22:00-07:00']);
    await badger.whenSyncRuns();

    await badger.whenSettingsSaved({
      ...badger.settingsStore.settings,
      initialDelayMinutes: 30,
    });
    await badger.whenSyncRuns();

    expect(badger.server.settings.quietHours).toEqual(['22:00-07:00']);
  });
});
