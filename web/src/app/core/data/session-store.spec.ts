import { normalizeBaseUrl, resolveWaitMinutes } from './session-store';

/**
 * Ported from WaitSettingsMigrationTest.kt. Upgrading an install that predates
 * the configurable wait list must carry the old medium/long pair over instead
 * of silently reverting to the defaults.
 */
describe('resolveWaitMinutes', () => {
  it('an upgraded install keeps the medium and long waits it was configured with', () => {
    expect(resolveWaitMinutes(null, 45, 720)).toEqual([45, 720]);
  });

  it('a stored list wins over the legacy pair once the user has saved one', () => {
    expect(resolveWaitMinutes('15,60,240', 45, 720)).toEqual([15, 60, 240]);
  });

  it('a fresh install with nothing stored gets the defaults', () => {
    expect(resolveWaitMinutes(null, null, null)).toEqual([60, 240]);
  });

  it('a half-written legacy pair still yields the one value it has', () => {
    expect(resolveWaitMinutes(null, 45, null)).toEqual([45]);
  });

  it('unusable stored values fall back rather than leaving no snooze options', () => {
    expect(resolveWaitMinutes('', null, null)).toEqual([60, 240]);
    expect(resolveWaitMinutes('nonsense', null, null)).toEqual([60, 240]);
    expect(resolveWaitMinutes('0,-5', null, null)).toEqual([60, 240]);
    expect(resolveWaitMinutes(null, 0, 0)).toEqual([60, 240]);
  });

  it('a partly-corrupt list keeps the entries that do parse', () => {
    expect(resolveWaitMinutes('30, ,90,x', null, null)).toEqual([30, 90]);
  });
});

describe('normalizeBaseUrl', () => {
  it('trims whitespace and trailing slashes', () => {
    expect(normalizeBaseUrl('  http://localhost:5000/  ')).toBe('http://localhost:5000');
    expect(normalizeBaseUrl('http://host//')).toBe('http://host');
  });
});
