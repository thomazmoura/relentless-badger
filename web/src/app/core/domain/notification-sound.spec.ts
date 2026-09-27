import {
  BUILT_IN_SOUNDS,
  NotificationSound,
  SILENT,
  SYSTEM_DEFAULT,
  builtIn,
  parseNotificationSound,
  toStorageString,
} from './notification-sound';

// Ported from NotificationSoundTest.kt.
describe('stored notification sounds', () => {
  const roundTrip = (sound: NotificationSound) =>
    expect(parseNotificationSound(toStorageString(sound))).toEqual(sound);

  it('every kind of sound survives being stored', () => {
    roundTrip(SILENT);
    roundTrip(SYSTEM_DEFAULT);
    BUILT_IN_SOUNDS.forEach((s) => roundTrip(builtIn(s.key)));
    roundTrip({ kind: 'custom', uri: 'data:audio/mpeg;base64,SUQz', label: 'pixie-dust.mp3' });
  });

  it('a title with a bar in it keeps the whole title', () => {
    roundTrip({ kind: 'custom', uri: 'data:audio/ogg;base64,T2dn', label: 'Ping | Pong' });
  });

  it('nothing stored is the system default', () => {
    expect(parseNotificationSound(undefined)).toEqual(SYSTEM_DEFAULT);
    expect(parseNotificationSound(null)).toEqual(SYSTEM_DEFAULT);
  });

  it('garbage is the system default', () => {
    expect(parseNotificationSound('klaxon')).toEqual(SYSTEM_DEFAULT);
  });

  it('a built-in this version does not ship is the system default', () => {
    expect(parseNotificationSound('builtin:foghorn')).toEqual(SYSTEM_DEFAULT);
  });

  it('a custom sound with no uri is the system default', () => {
    expect(parseNotificationSound('custom:|Mystery')).toEqual(SYSTEM_DEFAULT);
  });

  it('a custom sound stored without a title gets a generic one', () => {
    expect(parseNotificationSound('custom:data:audio/wav;base64,UklG')).toEqual({
      kind: 'custom',
      uri: 'data:audio/wav;base64,UklG',
      label: 'Custom sound',
    });
  });
});
