import { BadgerScenario } from '../testing/badger-scenario';

// Ported from the MutationsRequestSyncScenarios half of WorkSchedulingScenarios.kt.
// The other half tested WorkManager's CONNECTED constraint; its web counterpart
// lives in core/sync/web-sync-scheduler.spec.ts.
describe('mutations request a sync', () => {
  let badger: BadgerScenario;

  beforeEach(() => {
    badger = new BadgerScenario();
  });

  it('every local mutation asks for a background sync', async () => {
    badger.givenOffline();

    const task = await badger.whenTaskCreated('water plants');
    expect(badger.syncRequests.requests).toBe(1);

    await badger.whenTaskCompleted(task.id);
    expect(badger.syncRequests.requests).toBe(2);

    await badger.whenSettingsSaved({
      initialDelayMinutes: 30,
      repeatIntervalMinutes: 5,
      waitMinutes: [90, 300],
      defaultWaitIndex: 0,
    });
    expect(badger.syncRequests.requests).toBe(3);
  });
});
