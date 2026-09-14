/** How long a task row takes to slide into its new slot. */
export const ROW_MOVE_ANIMATION_MILLIS = 300;

/**
 * How long taps on task rows are swallowed after one moves. Longer than the
 * slide itself: a tap already on its way when the row moved lands a beat after
 * the list has settled, and it was aimed at whatever used to be there.
 */
export const ROW_MOVE_COOLDOWN_MILLIS = 600;

/** The "Scheduled" section header's slot in the row sequence. */
export const SCHEDULED_HEADER_KEY = 'scheduled-header';

/** The list's rows top to bottom, as the keys the animation and the guard see. */
export function rowKeys(activeIds: readonly string[], scheduledIds: readonly string[]): string[] {
  return scheduledIds.length === 0
    ? [...activeIds]
    : [...activeIds, SCHEDULED_HEADER_KEY, ...scheduledIds];
}

/**
 * Makes a tap a no-op while the rows are still moving. Rows reorder on their own
 * — a nag fires, a sync lands, a start time passes — and without this a tap aimed
 * at one task lands on whichever task just slid into its place.
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
    if (this.movedAtMillis === null) return true;
    return this.clock() - this.movedAtMillis >= ROW_MOVE_COOLDOWN_MILLIS;
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
