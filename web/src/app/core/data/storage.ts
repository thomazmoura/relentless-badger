/**
 * The key-value medium the database lives in. localStorage in the browser, a
 * Map in tests — the seam that lets the scenario suite exercise the real store
 * code the way the Android tests exercise a real in-memory Room database.
 */
export interface StorageDriver {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** Every key currently held, so the store can spot a partially written state. */
  keys(): string[];
}

export class LocalStorageDriver implements StorageDriver {
  constructor(private readonly backing: Storage = localStorage) {}

  getItem(key: string): string | null {
    return this.backing.getItem(key);
  }

  setItem(key: string, value: string): void {
    this.backing.setItem(key, value);
  }

  removeItem(key: string): void {
    this.backing.removeItem(key);
  }

  keys(): string[] {
    return Object.keys(this.backing);
  }
}

/** Map-backed driver for tests and for browsers that deny storage access. */
export class MemoryStorageDriver implements StorageDriver {
  private readonly entries = new Map<string, string>();

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }

  keys(): string[] {
    return [...this.entries.keys()];
  }
}

/** True for the various names browsers give a full-storage failure. */
export function isQuotaExceeded(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.name === 'QUOTA_EXCEEDED_ERR')
  );
}

/** localStorage throws on access in some privacy modes; fall back to memory. */
export function createDefaultDriver(): StorageDriver {
  try {
    const probe = '__badger_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return new LocalStorageDriver();
  } catch {
    return new MemoryStorageDriver();
  }
}
