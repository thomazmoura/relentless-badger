import { BadgerScenario } from '../testing/badger-scenario';

// Ported from TitleSuggestionScenarios.kt.
describe('title suggestions', () => {
  let badger: BadgerScenario;

  beforeEach(() => {
    badger = new BadgerScenario();
  });

  it('titles used on this device suggest offline, including completed tasks', async () => {
    badger.givenOffline();

    const task = await badger.whenTaskCreated('water plants');
    await badger.whenTaskCompleted(task.id);
    await badger.whenTaskCreated('walk dog');

    const titles = await badger.repository.titles();
    expect(titles).toContain('water plants');
    expect(titles).toContain('walk dog');
  });

  it('titles known only to the server join local suggestions after a sync', async () => {
    badger.givenOffline();
    await badger.whenTaskCreated('local habit');
    badger.givenOnline();
    badger.givenServerHasOpenTask('habit from the other phone');

    await badger.whenSyncRuns();

    const titles = await badger.repository.titles();
    expect(titles).toContain('local habit');
    expect(titles).toContain('habit from the other phone');
  });

  it('a dismissed title stops being suggested', async () => {
    badger.givenOffline();
    await badger.whenTaskCreated('water plants');
    await badger.whenTaskCreated('walk dog');

    await badger.whenSuggestionDismissed('water plants');

    const titles = await badger.repository.titles();
    expect(titles).not.toContain('water plants');
    expect(titles).toContain('walk dog');
  });

  it('a dismissed title stays gone when the server still reports it', async () => {
    badger.givenOnline();
    badger.givenServerHasOpenTask('habit from the other phone');
    await badger.whenSyncRuns();

    await badger.whenSuggestionDismissed('habit from the other phone');
    await badger.whenSyncRuns();

    expect(await badger.repository.titles()).not.toContain('habit from the other phone');
  });

  it('undoing a dismissal suggests the title again', async () => {
    badger.givenOffline();
    await badger.whenTaskCreated('water plants');
    await badger.whenSuggestionDismissed('water plants');

    await badger.whenSuggestionDismissalUndone('water plants');

    expect(await badger.repository.titles()).toContain('water plants');
  });

  it('using a dismissed title again brings it back', async () => {
    badger.givenOffline();
    await badger.whenTaskCreated('water plants');
    await badger.whenSuggestionDismissed('water plants');

    await badger.whenTaskCreated('water plants');

    expect(await badger.repository.titles()).toContain('water plants');
  });

  it('a repeatedly used title ranks above one-offs', async () => {
    badger.givenOffline();

    await badger.whenTaskCreated('one off');
    badger.whenTimeAdvancesMinutes(1);
    await badger.whenTaskCreated('water plants');
    badger.whenTimeAdvancesMinutes(1);
    await badger.whenTaskCreated('water plants');

    expect((await badger.repository.titles())[0]).toBe('water plants');
  });
});
