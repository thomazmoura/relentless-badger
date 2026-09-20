import { buildDailyOverview } from '../domain/daily-overview';
import { dateAt, LocalDate } from '../domain/time';
import { BadgerScenario, MINUTE } from '../testing/badger-scenario';

/** UTC, so START_OF_TIME is local midnight — matching the Kotlin harness. */
const SCENARIO_ZONE = 'UTC';

/**
 * Ported from DayOverviewScenarios.kt. The day overview read back through the
 * real stores: what a past day left behind, and what it closed. The digest is a
 * view over the same two tables the task list and the calendar read, so
 * whatever the repository wrote is what the day reports — offline included.
 */
describe('day overview', () => {
  let badger: BadgerScenario;

  beforeEach(() => {
    badger = new BadgerScenario();
  });

  /** The local date `millis` falls on, as the overview buckets by. */
  const dateOf = (millis: number): LocalDate => dateAt(millis, SCENARIO_ZONE);

  const overviewFor = async (date: LocalDate) =>
    buildDailyOverview(
      await badger.taskDao.getActive(),
      await badger.completedCache(),
      date,
      badger.clock.now(),
      true,
      SCENARIO_ZONE,
    );

  it("reports a task completed on an earlier day as that day's work", async () => {
    const task = await badger.givenSyncedTask('water plants');
    const completedAt = badger.clock.now();
    await badger.whenTaskCompleted(task.id);

    // Two days on, looking back at the day it was closed.
    badger.whenTimeAdvancesMinutes(2 * 24 * 60);
    const overview = await overviewFor(dateOf(completedAt));

    expect(overview.sections.map((section) => section.kind)).toEqual(['done']);
    expect(overview.sections[0].items.map((item) => item.title)).toEqual(['water plants']);
  });

  it('reports a task left unfinished as the day it was due being overdue', async () => {
    const dueAt = badger.clock.now() + 30 * MINUTE;
    await badger.whenTaskCreated('renew passport', dueAt);

    badger.whenTimeAdvancesMinutes(2 * 24 * 60);
    const overview = await overviewFor(dateOf(dueAt));

    expect(overview.sections.map((section) => section.kind)).toEqual(['overdue']);
    expect(overview.sections[0].items[0].atMillis).toBe(dueAt);
  });

  it('leaves a cancelled task neither owed nor done', async () => {
    const task = await badger.givenSyncedTask('water plants');
    const cancelledAt = badger.clock.now();
    await badger.whenTaskCancelled(task.id);

    badger.whenTimeAdvancesMinutes(2 * 24 * 60);
    const overview = await overviewFor(dateOf(cancelledAt));

    expect(overview.sections, "a cancellation is the calendar's business").toEqual([]);
  });

  it('puts a task back on the day it is owed when its conclusion is undone', async () => {
    const task = await badger.givenSyncedTask('water plants');
    const dueAt = (await badger.localTask(task.id)).firstWarningAtMillis ?? badger.clock.now();
    const concluded = await badger.whenTaskCompleted(task.id);

    await badger.whenConclusionUndone(concluded!);

    const overview = await overviewFor(dateOf(dueAt));

    expect(
      overview.sections[0].items.map((item) => item.title),
      'the completion is forgotten, so only the open task remains',
    ).toEqual(['water plants']);
  });
});
