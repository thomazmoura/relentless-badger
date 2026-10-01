import { parseWaitDuration } from './wait-duration';

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

// Ported from WaitDurationTest.kt.
describe('typed wait durations', () => {
  it('minutes alone', () => {
    expect(parseWaitDuration('20m')).toBe(20 * MINUTE);
    expect(parseWaitDuration('20min')).toBe(20 * MINUTE);
  });

  it('a bare number means minutes', () => {
    expect(parseWaitDuration('27')).toBe(27 * MINUTE);
  });

  it('minutes and seconds, with or without a space', () => {
    expect(parseWaitDuration('15m 45s')).toBe(15 * MINUTE + 45 * SECOND);
    expect(parseWaitDuration('15m45s')).toBe(15 * MINUTE + 45 * SECOND);
  });

  it('every unit together, in any case and with stray spaces', () => {
    expect(parseWaitDuration(' 1H 5 M 10s ')).toBe(HOUR + 5 * MINUTE + 10 * SECOND);
  });

  it('seconds alone may exceed a minute', () => {
    expect(parseWaitDuration('90s')).toBe(90 * SECOND);
  });

  it('nothing, garbage or a number without its unit is not a wait', () => {
    for (const text of ['', '   ', 'soon', '1h30', '-5m', '1.5h']) {
      expect(parseWaitDuration(text)).toBeNull();
    }
  });

  it('units out of order or repeated are rejected rather than guessed at', () => {
    expect(parseWaitDuration('45s 15m')).toBeNull();
    expect(parseWaitDuration('5m 5m')).toBeNull();
  });

  it('a zero wait is rejected because it would fire at once', () => {
    expect(parseWaitDuration('0')).toBeNull();
    expect(parseWaitDuration('0m 0s')).toBeNull();
  });
});
