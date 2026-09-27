/**
 * What a nag sounds like on this device. Local-only, like on Android: an
 * uploaded sound lives in this browser's storage and means nothing on another
 * device, so it never travels through the settings DTO.
 *
 * The web's `custom` carries the audio itself as a data URL where Android's
 * carries a content URI — a browser has no shared library of sounds to point at.
 */
export type NotificationSound =
  | { readonly kind: 'silent' }
  /** Whatever the OS plays for notifications — what the app always did. */
  | { readonly kind: 'system' }
  /** One of BUILT_IN_SOUNDS, by key. */
  | { readonly kind: 'builtin'; readonly key: string }
  /** A sound uploaded by the user, with the file name it had. */
  | { readonly kind: 'custom'; readonly uri: string; readonly label: string };

export interface BuiltInSound {
  readonly key: string;
  readonly label: string;
}

export const SILENT: NotificationSound = { kind: 'silent' };
export const SYSTEM_DEFAULT: NotificationSound = { kind: 'system' };

/**
 * Shipped with the app, from Google's Material sound resources (CC-BY 4.0; see
 * SOUNDS-LICENSE.md). Keys are what gets stored, so they must never be renamed;
 * the asset files are named after them on both platforms.
 */
export const BUILT_IN_SOUNDS: readonly BuiltInSound[] = [
  { key: 'simple-01', label: 'Simple' },
  { key: 'simple-02', label: 'Simple 2' },
  { key: 'decorative-01', label: 'Decorative' },
  { key: 'decorative-02', label: 'Decorative 2' },
  { key: 'ambient', label: 'Ambient' },
  { key: 'high-intensity', label: 'Urgent' },
];

export function builtIn(key: string): NotificationSound {
  return { kind: 'builtin', key };
}

export function notificationSoundLabel(sound: NotificationSound): string {
  switch (sound.kind) {
    case 'silent':
      return 'Silent';
    case 'system':
      return 'System default';
    case 'builtin':
      return BUILT_IN_SOUNDS.find((s) => s.key === sound.key)?.label ?? sound.key;
    case 'custom':
      return sound.label;
  }
}

/** Where the audio for a sound the page plays itself comes from; null for the OS's own. */
export function notificationSoundSource(sound: NotificationSound): string | null {
  switch (sound.kind) {
    case 'builtin':
      return `sounds/notification_${sound.key}.mp3`;
    case 'custom':
      return sound.uri;
    default:
      return null;
  }
}

/**
 * The stored form: `silent`, `system`, `builtin:<key>` or `custom:<uri>|<label>`.
 * The URI goes first because it never holds a `|` (a data URL is base64), while
 * a file name might.
 */
export function toStorageString(sound: NotificationSound): string {
  switch (sound.kind) {
    case 'silent':
      return 'silent';
    case 'system':
      return 'system';
    case 'builtin':
      return `builtin:${sound.key}`;
    case 'custom':
      return `custom:${sound.uri}|${sound.label}`;
  }
}

/**
 * The stored sound, or the system default when nothing usable is stored. A
 * corrupt value, or a built-in that a later version dropped, should cost the
 * user their choice — not their reminders' sound altogether.
 */
export function parseNotificationSound(stored: string | null | undefined): NotificationSound {
  if (stored === 'silent') return SILENT;
  if (stored?.startsWith('builtin:')) {
    const key = stored.slice('builtin:'.length);
    return BUILT_IN_SOUNDS.some((s) => s.key === key) ? builtIn(key) : SYSTEM_DEFAULT;
  }
  if (stored?.startsWith('custom:')) {
    const rest = stored.slice('custom:'.length);
    const bar = rest.indexOf('|');
    const uri = bar < 0 ? rest : rest.slice(0, bar);
    const label = bar < 0 ? '' : rest.slice(bar + 1);
    if (uri.trim() === '') return SYSTEM_DEFAULT;
    return { kind: 'custom', uri, label: label.trim() === '' ? 'Custom sound' : label };
  }
  return SYSTEM_DEFAULT;
}
