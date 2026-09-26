import { CrashLog, CrashLogStorage, DEFAULT_MAX_CHARS } from './crash-log';

// Ported from CrashLogTest.kt.
describe('CrashLog', () => {
  let stored: Map<string, string>;
  let storage: CrashLogStorage;
  let clock: number;

  beforeEach(() => {
    stored = new Map();
    storage = {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => void stored.set(key, value),
      removeItem: (key) => void stored.delete(key),
    };
    clock = Date.parse('2026-09-26T10:00:00Z');
  });

  const log = (maxChars = DEFAULT_MAX_CHARS) =>
    new CrashLog(storage, 'test-env', maxChars, () => clock);

  it('an empty log has nothing to share', () => {
    expect(log().read()).toBe('');
    expect(log().summary()).toEqual({ count: 0, latestMillis: null });
  });

  it('a crash is recorded with its stack trace and cause', () => {
    const crashLog = log();

    crashLog.recordError(new Error('outer', { cause: new TypeError('inner') }));

    const text = crashLog.read();
    expect(text).toContain('Uncaught error');
    expect(text).toContain('test-env');
    expect(text).toContain('Error: outer');
    expect(text).toContain('Caused by: TypeError: inner');
    expect(crashLog.summary()).toEqual({ count: 1, latestMillis: clock });
  });

  it('the summary counts entries and reports the newest', () => {
    const crashLog = log();
    crashLog.record('first', 'a');
    clock = Date.parse('2026-09-26T11:30:00Z');
    crashLog.record('second', 'b');

    expect(crashLog.summary()).toEqual({ count: 2, latestMillis: clock });
  });

  it('the log survives a new instance, as after a reload', () => {
    log().record('before reload', 'trace');
    expect(log().summary().count).toBe(1);
  });

  it('the oldest entries are dropped to stay under the cap', () => {
    const crashLog = log(400);
    for (let i = 0; i < 10; i++) crashLog.record(`crash ${i}`, 'x'.repeat(40));

    const text = crashLog.read();
    expect(text.length).toBeLessThanOrEqual(400);
    expect(text).toContain('crash 9');
    expect(text).not.toContain('crash 0 ');
    expect(text.startsWith('=== ')).toBe(true);
  });

  it('an oversized trace is truncated rather than evicting everything', () => {
    const crashLog = log(400);
    crashLog.record('small', 'ok');
    crashLog.record('huge', 'y'.repeat(10_000));

    const text = crashLog.read();
    expect(text).toContain('small');
    expect(text).toContain('(truncated)');
  });

  it('clearing empties the log', () => {
    const crashLog = log();
    crashLog.record('crash', 'trace');

    crashLog.clear();

    expect(crashLog.summary()).toEqual({ count: 0, latestMillis: null });
  });
});
