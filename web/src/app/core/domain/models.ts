/**
 * The stored shapes. These mirror the Android Room entities field for field so
 * both clients agree on what a task is, and so a row can be handed to the API
 * mapping without translation.
 */

/**
 * Local copy of every open (not yet completed) task — the source of truth the
 * app runs off. pendingCreate marks tasks created here that still need to reach
 * the API; pendingDone marks completions; pendingUpdate marks schedule edits.
 *
 * A recurring task is an ordinary occurrence carrying its rule: recurEveryN
 * null means not recurring; recurUnit is "days" or "weeks"; recurDaysOfWeek is
 * a bitmask (bit 0 = Monday .. bit 6 = Sunday) used only for weeks. Completing
 * an occurrence spawns the next one as a new row sharing the seriesId.
 */
export interface OpenTask {
  readonly id: string;
  readonly title: string;
  readonly createdAtMillis: number;
  readonly initialDelayMinutes: number;
  readonly repeatIntervalMinutes: number;
  readonly firstWarningAtMillis: number | null;
  /** Live nag time. Local-only: it drifts with snoozes and is never synced. */
  readonly nextFireAtMillis: number;
  readonly recurEveryN: number | null;
  readonly recurUnit: string | null;
  readonly recurDaysOfWeek: number | null;
  readonly seriesId: string | null;
  readonly pendingDone: boolean;
  readonly pendingCreate: boolean;
  readonly pendingUpdate: boolean;
}

/**
 * Completion history cache, so the calendar works offline. Written the moment a
 * task is closed on this device (with the local clock's timestamp) and
 * reconciled from the server's done list during sync.
 */
export interface CompletedTask {
  readonly id: string;
  readonly title: string;
  readonly completedAtMillis: number;
  readonly seriesId: string | null;
  /** Closed without being done — kept for the record, hidden from history by default. */
  readonly cancelled: boolean;
}

/**
 * Every title ever used here (plus titles learned from the server). Dismissed
 * titles are kept rather than deleted, so the next sync can't relearn them.
 */
export interface TitleHistory {
  readonly title: string;
  readonly useCount: number;
  readonly lastUsedAtMillis: number;
  readonly dismissed: boolean;
}

export const MAX_WAITS = 6;
export const DEFAULT_WAIT_MINUTES: readonly number[] = [60, 240];
export const DEFAULT_INITIAL_DELAY_MINUTES = 60;
export const DEFAULT_REPEAT_INTERVAL_MINUTES = 15;

export interface SettingsDto {
  readonly initialDelayMinutes: number;
  readonly repeatIntervalMinutes: number;
  /** Ordered snooze options, 1..MAX_WAITS entries, each at least a minute. */
  readonly waitMinutes: readonly number[];
  /** Index into waitMinutes: the wait the reminder's one-tap button uses. */
  readonly defaultWaitIndex: number;
  /**
   * Wall-clock windows as "HH:mm-HH:mm" in which reminders are held back until
   * the window ends; empty means off. Only the Android client acts on these,
   * but they are account settings, so this client carries them through its
   * push and pull instead of wiping them.
   */
  readonly quietHours: readonly string[];
}

export interface Session extends SettingsDto {
  readonly baseUrl: string;
  readonly token: string | null;
  readonly email: string | null;
  readonly settingsDirty: boolean;
}

export function isSignedIn(session: Session): boolean {
  return session.token !== null && session.baseUrl.trim() !== '';
}

export function defaultWaitMinutes(session: SettingsDto): number {
  return session.waitMinutes[session.defaultWaitIndex] ?? session.waitMinutes[0];
}

// --- Recurrence -------------------------------------------------------------

export type RecurUnit = 'days' | 'weeks';

/**
 * A task's recurrence rule. daysOfWeek is a bitmask (bit 0 = Monday ..
 * bit 6 = Sunday) and only meaningful when unit is "weeks", where it must have
 * at least one bit set.
 */
export interface Recurrence {
  readonly everyN: number;
  readonly unit: RecurUnit;
  readonly daysOfWeek: number;
}

export function recurrenceOf(everyN: number, unit: RecurUnit, daysOfWeek = 0): Recurrence {
  if (everyN < 1) {
    throw new Error('everyN must be at least 1');
  }
  if (unit === 'weeks' && (daysOfWeek < 1 || daysOfWeek > 127)) {
    throw new Error('weekly recurrence needs a daysOfWeek bitmask between 1 and 127');
  }
  return { everyN, unit, daysOfWeek };
}

export function recurUnitFromWire(value: string | null | undefined): RecurUnit | null {
  return value === 'days' || value === 'weeks' ? value : null;
}

/** The three recurrence columns folded back into a rule, or null when not recurring. */
export function taskRecurrence(task: OpenTask): Recurrence | null {
  if (task.recurEveryN === null || task.recurEveryN === undefined) return null;
  const unit = recurUnitFromWire(task.recurUnit);
  if (unit === null) return null;
  return recurrenceOf(task.recurEveryN, unit, task.recurDaysOfWeek ?? 0);
}
