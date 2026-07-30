/**
 * Asks for a push. Every repository mutation calls this and returns; whether
 * the sync runs now, when the network comes back, or never (signed out) is the
 * scheduler's problem.
 */
export interface SyncScheduler {
  requestSync(): void;
}
