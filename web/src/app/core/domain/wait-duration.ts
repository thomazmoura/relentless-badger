/**
 * Hours, minutes and seconds in that order, each optional but at least one
 * present: "1h 20m", "15m45s", "90s". Spaces are allowed anywhere between the
 * parts. Five digits per part is far beyond any sensible snooze and keeps the
 * total well inside a safe integer.
 */
const WAIT_DURATION = /^(?:(\d{1,5})\s*h)?\s*(?:(\d{1,5})\s*m(?:in)?)?\s*(?:(\d{1,5})\s*s)?$/i;

const BARE_MINUTES = /^\d{1,5}$/;

/**
 * Reads a typed wait such as "27m" or "15m 45s" into milliseconds, or null when
 * it isn't one. A bare number means minutes, the unit every configured wait
 * already speaks. A zero total is rejected too: snoozing for nothing would fire
 * at once and look like the snooze did nothing.
 */
export function parseWaitDuration(text: string): number | null {
  const trimmed = text.trim();
  if (BARE_MINUTES.test(trimmed)) {
    const millis = Number(trimmed) * 60_000;
    return millis > 0 ? millis : null;
  }
  const match = WAIT_DURATION.exec(trimmed);
  if (match === null) return null;
  const [, hours, minutes, seconds] = match;
  if (hours === undefined && minutes === undefined && seconds === undefined) return null;
  const millis =
    Number(hours ?? 0) * 3_600_000 + Number(minutes ?? 0) * 60_000 + Number(seconds ?? 0) * 1_000;
  return millis > 0 ? millis : null;
}
