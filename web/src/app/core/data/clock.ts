/** Clock seam so scenario tests can control time. */
export interface Clock {
  now(): number;
}

export const SYSTEM_CLOCK: Clock = { now: () => Date.now() };
