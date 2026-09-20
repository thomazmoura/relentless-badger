import {
  ROW_MOVE_COOLDOWN_MILLIS,
  RowMovementGuard,
  SCHEDULED_LATER_HEADER_KEY,
  SCHEDULED_TODAY_HEADER_KEY,
  rowKeys,
} from './row-movement-guard';

// Ported from RowMovementGuardTest.kt.
describe('RowMovementGuard', () => {
  let now: number;
  let guard: RowMovementGuard;

  beforeEach(() => {
    now = 1_000;
    guard = new RowMovementGuard(() => now);
  });

  it("the first list shown doesn't lock taps", () => {
    guard.observe(['a', 'b', 'c']);

    expect(guard.allowsTap()).toBe(true);
  });

  it('a row changing slot locks taps until the cooldown passes', () => {
    guard.observe(['a', 'b', 'c']);

    guard.observe(['b', 'c', 'a']);

    expect(guard.allowsTap()).toBe(false);
    now += ROW_MOVE_COOLDOWN_MILLIS - 1;
    expect(guard.allowsTap()).toBe(false);
    now += 1;
    expect(guard.allowsTap()).toBe(true);
  });

  it('removing a middle row locks taps because the rows below shift up', () => {
    guard.observe(['a', 'b', 'c']);

    guard.observe(['a', 'c']);

    expect(guard.allowsTap()).toBe(false);
  });

  it('a row added above the others locks taps', () => {
    guard.observe(['a', 'b']);

    guard.observe(['new', 'a', 'b']);

    expect(guard.allowsTap()).toBe(false);
  });

  it('removing the last row or appending one moves nothing', () => {
    guard.observe(['a', 'b', 'c']);

    guard.observe(['a', 'b']);
    guard.observe(['a', 'b', 'd']);

    expect(guard.allowsTap()).toBe(true);
  });

  it("re-rendering the same order doesn't lock taps", () => {
    guard.observe(['a', 'b']);

    expect(guard.observe(['a', 'b'])).toBe(false);

    expect(guard.allowsTap()).toBe(true);
  });

  it('a move during the cooldown restarts it', () => {
    guard.observe(['a', 'b', 'c']);
    guard.observe(['b', 'a', 'c']);
    now += ROW_MOVE_COOLDOWN_MILLIS - 100;

    guard.observe(['b', 'c', 'a']);
    now += 100;

    expect(guard.allowsTap()).toBe(false);
    now += ROW_MOVE_COOLDOWN_MILLIS;
    expect(guard.allowsTap()).toBe(true);
  });

  it('the remaining lock counts down to zero and no further', () => {
    expect(guard.tapLockRemainingMillis()).toBe(0);
    guard.observe(['a', 'b']);
    guard.observe(['b', 'a']);

    now += 200;

    expect(guard.tapLockRemainingMillis()).toBe(ROW_MOVE_COOLDOWN_MILLIS - 200);
    now += ROW_MOVE_COOLDOWN_MILLIS;
    expect(guard.tapLockRemainingMillis()).toBe(0);
  });

  it('a move during the cooldown pushes the remaining lock back', () => {
    guard.observe(['a', 'b', 'c']);
    guard.observe(['b', 'a', 'c']);
    now += ROW_MOVE_COOLDOWN_MILLIS - 100;

    guard.observe(['b', 'c', 'a']);

    expect(guard.tapLockRemainingMillis()).toBe(ROW_MOVE_COOLDOWN_MILLIS);
  });

  it('a task starting moves across the scheduled header', () => {
    const before = rowKeys(['a'], ['s1', 's2'], []);
    const after = rowKeys(['a', 's1'], ['s2'], []);
    expect(before).toEqual(['a', SCHEDULED_TODAY_HEADER_KEY, 's1', 's2']);
    guard.observe(before);

    guard.observe(after);

    expect(guard.allowsTap()).toBe(false);
  });

  it('a task crossing midnight moves across the later header', () => {
    guard.observe(rowKeys(['a'], [], ['l1', 'l2']));

    guard.observe(rowKeys(['a'], ['l1'], ['l2']));

    expect(guard.allowsTap()).toBe(false);
  });

  it('leaves an empty section no slot, so the rows below it keep theirs', () => {
    const keys = rowKeys(['a'], [], ['l1']);
    expect(keys).toEqual(['a', SCHEDULED_LATER_HEADER_KEY, 'l1']);
    guard.observe(keys);

    // The same three rows re-rendered: nothing shifted, so taps stay live.
    guard.observe(rowKeys(['a'], [], ['l1']));

    expect(guard.allowsTap()).toBe(true);
  });
});
