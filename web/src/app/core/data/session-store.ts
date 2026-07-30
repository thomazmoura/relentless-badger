import { Signal } from '@angular/core';
import { DEFAULT_WAIT_MINUTES, Session, SettingsDto } from '../domain/models';
import { BadgerStore } from './local-store';

/**
 * The slice of session state the business logic needs: the current settings
 * snapshot, the server base URL, and the "settings edited locally, not yet
 * pushed" flag. Fakeable in scenario tests without dragging storage in.
 */
export interface SettingsStore {
  current(): Promise<Session>;
  saveBaseUrl(baseUrl: string): Promise<void>;
  saveSettings(settings: SettingsDto): Promise<void>;
  markSettingsDirty(): Promise<void>;
  clearSettingsDirty(): Promise<void>;
  isSettingsDirty(): Promise<boolean>;
}

export class LocalSessionStore implements SettingsStore {
  readonly session: Signal<Session>;

  constructor(private readonly store: BadgerStore) {
    this.session = store.sessionState;
  }

  /** Read synchronously by the auth interceptor, which cannot await. */
  get cachedToken(): string | null {
    return this.store.currentSession().token;
  }

  get cachedBaseUrl(): string {
    return this.store.currentSession().baseUrl;
  }

  async current(): Promise<Session> {
    return this.store.currentSession();
  }

  async saveBaseUrl(baseUrl: string): Promise<void> {
    this.store.patchSession({ baseUrl: normalizeBaseUrl(baseUrl) });
  }

  async saveLogin(token: string, email: string, settings: SettingsDto): Promise<void> {
    this.store.patchSession({ token, email, ...normalize(settings) });
  }

  async saveSettings(settings: SettingsDto): Promise<void> {
    this.store.patchSession(normalize(settings));
  }

  async markSettingsDirty(): Promise<void> {
    this.store.patchSession({ settingsDirty: true });
  }

  async clearSettingsDirty(): Promise<void> {
    this.store.patchSession({ settingsDirty: false });
  }

  async isSettingsDirty(): Promise<boolean> {
    return this.store.currentSession().settingsDirty;
  }

  async clear(): Promise<void> {
    this.store.clearAll();
  }
}

/** Copies the DTO's arrays, so a stored session never aliases the caller's. */
function normalize(settings: SettingsDto): SettingsDto {
  return {
    ...settings,
    waitMinutes: [...settings.waitMinutes],
    quietHours: [...(settings.quietHours ?? [])],
  };
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

/**
 * The stored wait list, or — on an install upgrading from the fixed medium/long
 * pair — those two values folded into a list so the user's configuration
 * carries over. A malformed or empty stored list would leave the app with no
 * snooze options at all, so anything unusable falls back to the defaults.
 */
export function resolveWaitMinutes(
  csv: string | null | undefined,
  legacyMedium: number | null | undefined,
  legacyLong: number | null | undefined,
): number[] {
  const parsed = csv === null || csv === undefined ? null : parseWaitMinutes(csv);
  if (parsed !== null) return parsed;
  const legacy = [legacyMedium, legacyLong].filter(
    (m): m is number => typeof m === 'number' && m >= 1,
  );
  return legacy.length > 0 ? legacy : [...DEFAULT_WAIT_MINUTES];
}

function parseWaitMinutes(csv: string): number[] | null {
  const values = csv
    .split(',')
    // Whole numbers only, like Kotlin's toIntOrNull: "1.5" and "90x" are not waits.
    .map((part) => (/^[+-]?\d+$/.test(part.trim()) ? Number(part.trim()) : NaN))
    .filter((value) => Number.isInteger(value) && value >= 1);
  return values.length > 0 ? values : null;
}
