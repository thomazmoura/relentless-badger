/**
 * How long taps on task rows are swallowed after one moves. A tap is already on
 * its way when the order changes: it lands a beat later, aimed at whatever used
 * to hold that slot.
 */
export const ROW_MOVE_COOLDOWN_MILLIS = 600;

/**
 * How faint a row's buttons go while taps are locked — Material's disabled
 * alpha, so the lock reads as "not now" rather than as something new.
 */
export const ROW_LOCKED_BUTTON_ALPHA = 0.38;

/** How long the buttons take to fade in and out of the locked look. */
export const ROW_LOCK_FADE_MILLIS = 150;

/** The "Scheduled" section header's slot in the row sequence. */
export const SCHEDULED_HEADER_KEY = 'scheduled-header';

/** The list's rows top to bottom, as the keys the list and the guard see. */
export function rowKeys(activeIds: readonly string[], scheduledIds: readonly string[]): string[] {
  return scheduledIds.length === 0
    ? [...activeIds]
    : [...activeIds, SCHEDULED_HEADER_KEY, ...scheduledIds];
}

/**
 * Makes a tap a no-op while the rows are still moving. Rows reorder on their own
 * — a nag fires, a sync lands, a start time passes — and without this a tap aimed
 * at one task lands on whichever task just took its place.
 *
 * Only a row that stays on screen but changes slot counts as a move: the first
 * list shown, a countdown tick that re-renders the same order, or a row dropping
 * off the end leave nothing under the finger that wasn't there before.
 */
export class RowMovementGuard {
  private shownKeys: readonly string[] | null = null;
  private movedAtMillis: number | null = null;

  constructor(private readonly clock: () => number = () => performance.now()) {}

  /**
   * Records the rows now on screen. Returns whether the sequence changed at
   * all — a move or not — so the caller knows the list is about to re-anchor.
   */
  observe(keys: readonly string[]): boolean {
    const previous = this.shownKeys;
    if (previous && sameKeys(previous, keys)) return false;
    this.shownKeys = [...keys];
    if (previous && rowsShifted(previous, keys)) this.movedAtMillis = this.clock();
    return true;
  }

  allowsTap(): boolean {
    return this.tapLockRemainingMillis() === 0;
  }

  /**
   * How long until taps count again, 0 once they do. The UI waits on this
   * rather than a fixed cooldown to drop its locked look, because a further
   * move while locked pushes the end back.
   */
  tapLockRemainingMillis(): number {
    if (this.movedAtMillis === null) return 0;
    return Math.max(0, ROW_MOVE_COOLDOWN_MILLIS - (this.clock() - this.movedAtMillis));
  }
}

/** Whether any row present both before and after sits in a different slot. */
export function rowsShifted(before: readonly string[], after: readonly string[]): boolean {
  const slotAfter = new Map(after.map((key, index) => [key, index]));
  return before.some((key, index) => {
    const slot = slotAfter.get(key);
    return slot !== undefined && slot !== index;
  });
}

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}
