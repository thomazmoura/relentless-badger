import { recurrenceOf } from '../domain/models';
import { buildRecurringReport } from '../domain/recurring-report';
import { BadgerScenario, MINUTE } from '../testing/badger-scenario';

/**
 * Ported from RecurringReportScenarios.kt. The recurring report read back
 * through the real stores. It is a view over the open tasks, so whatever
 * occurrence the repository spawned is the one the report calls next.
 */
describe('recurring report', () => {
  let badger: BadgerScenario;

  beforeEach(() => {
    badger = new BadgerScenario();
  });

  const daily = recurrenceOf(1, 'days');

  const report = async () =>
    buildRecurringReport(await badger.taskDao.getActive(), badger.clock.now());

  it('reports the occurrence a completion spawned as next', async () => {
    const firstAt = badger.clock.now() + 9 * 60 * MINUTE;
    const task = await badger.whenTaskCreated('take pills', firstAt, daily);

    badger.whenTimeAdvancesMinutes(9 * 60 + 5);
    await badger.whenTaskCompleted(task.id);
    const items = await report();

    expect(items.length).toBe(1);
    expect(items[0].title).toBe('take pills');
    expect(items[0].nextAtMillis).toBe(firstAt + 24 * 60 * MINUTE);
    expect(items[0].nagging).toBe(false);
  });

  it('reports an occurrence left open as nagging', async () => {
    const firstAt = badger.clock.now() + 30 * MINUTE;
    await badger.whenTaskCreated('take pills', firstAt, daily);

    badger.whenTimeAdvancesMinutes(45);
    const items = await report();

    expect(items.length).toBe(1);
    expect(items[0].nagging).toBe(true);
    expect(items[0].nextAtMillis).toBe(firstAt);
  });

  it('keeps a one-off task out of the report', async () => {
    await badger.whenTaskCreated('renew passport', badger.clock.now() + 30 * MINUTE);

    expect(await report()).toEqual([]);
  });

  it('skips the report to the next occurrence when one is cancelled', async () => {
    const firstAt = badger.clock.now() + 30 * MINUTE;
    const task = await badger.whenTaskCreated('take pills', firstAt, daily);

    await badger.whenTaskCancelled(task.id);
    const items = await report();

    expect(items.length).toBe(1);
    expect(items[0].nextAtMillis).toBe(firstAt + 24 * 60 * MINUTE);
  });
});
