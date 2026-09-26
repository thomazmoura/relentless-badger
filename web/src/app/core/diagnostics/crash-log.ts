import { ErrorHandler, InjectionToken, inject } from '@angular/core';

/** How many crashes the log holds and when the newest happened, for Settings. */
export interface CrashLogSummary {
  readonly count: number;
  readonly latestMillis: number | null;
}

export type CrashLogStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const DEFAULT_MAX_CHARS = 64 * 1024;
const KEY = 'crashLog';
const ENTRY_PREFIX = '=== ';
const TITLE_SEPARATOR = ' · ';

/**
 * The web twin of the Android CrashLog: uncaught errors appended to a text log
 * kept on the device, so they can be shared from Settings. localStorage rather
 * than IndexedDB because it is synchronous — an async write may never finish
 * if the error is taking the page down with it. Capped at maxChars by dropping
 * the oldest entries.
 */
export class CrashLog {
  constructor(
    private readonly storage: CrashLogStorage,
    /** App and browser versions, stamped on every entry. */
    private readonly environment: string,
    private readonly maxChars: number = DEFAULT_MAX_CHARS,
    private readonly now: () => number = Date.now,
  ) {}

  record(title: string, body: string): void {
    // One runaway trace mustn't push every other entry out.
    const half = Math.floor(this.maxChars / 2);
    const trimmedBody = body.length > half ? `${body.slice(0, half)}\n… (truncated)` : body;
    const entry =
      `${ENTRY_PREFIX}${new Date(this.now()).toISOString()}${TITLE_SEPARATOR}${title} ===\n` +
      `${this.environment}\n` +
      `${trimmedBody.trimEnd()}\n\n`;
    try {
      this.storage.setItem(KEY, this.dropOldest(this.read() + entry));
    } catch {
      // Storage full or blocked: losing the log beats throwing from the error handler.
    }
  }

  recordError(error: unknown): void {
    this.record('Uncaught error', describe(error));
  }

  read(): string {
    try {
      return this.storage.getItem(KEY) ?? '';
    } catch {
      return '';
    }
  }

  summary(): CrashLogSummary {
    const headers = this.read()
      .split('\n')
      .filter((line) => line.startsWith(ENTRY_PREFIX));
    const last = headers.at(-1);
    const latest = last
      ? Date.parse(last.slice(ENTRY_PREFIX.length).split(TITLE_SEPARATOR)[0])
      : NaN;
    return { count: headers.length, latestMillis: Number.isNaN(latest) ? null : latest };
  }

  clear(): void {
    try {
      this.storage.removeItem(KEY);
    } catch {
      // Nothing stored to clear.
    }
  }

  /** Cuts whole entries off the front until the text fits. */
  private dropOldest(text: string): string {
    let result = text;
    while (result.length > this.maxChars) {
      const next = result.indexOf(`\n${ENTRY_PREFIX}`, 1);
      if (next < 0) return result.slice(-this.maxChars);
      result = result.slice(next + 1);
    }
    return result;
  }
}

/** The stack where there is one — that is the part worth sharing — including causes. */
function describe(error: unknown): string {
  if (error instanceof Error) {
    const own = error.stack ?? `${error.name}: ${error.message}`;
    return error.cause === undefined ? own : `${own}\nCaused by: ${describe(error.cause)}`;
  }
  try {
    return typeof error === 'string' ? error : JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export const CRASH_LOG = new InjectionToken<CrashLog>('CrashLog', {
  providedIn: 'root',
  factory: () => new CrashLog(browserStorage(), `RelentlessBadger web · ${navigator.userAgent}`),
});

function browserStorage(): CrashLogStorage {
  try {
    return localStorage;
  } catch {
    // Blocked site data: a log that holds nothing rather than no app at all.
    return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  }
}

/**
 * Records every error Angular sees — which, with provideBrowserGlobalErrorListeners,
 * includes window errors and unhandled promise rejections — then logs it as usual.
 */
export class CrashLogErrorHandler extends ErrorHandler {
  private readonly log = inject(CRASH_LOG);

  override handleError(error: unknown): void {
    this.log.recordError(error);
    super.handleError(error);
  }
}
