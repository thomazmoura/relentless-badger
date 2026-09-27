package com.relentlessbadger.app.data

import org.junit.Assert.assertEquals
import org.junit.Test

class NotificationSoundTest {

    private fun roundTrip(sound: NotificationSound) =
        assertEquals(sound, parseNotificationSound(sound.toStorageString()))

    @Test
    fun `every kind of sound survives being stored`() {
        roundTrip(NotificationSound.Silent)
        roundTrip(NotificationSound.SystemDefault)
        BUILT_IN_SOUNDS.forEach { roundTrip(NotificationSound.BuiltIn(it.key)) }
        roundTrip(NotificationSound.Custom("content://media/internal/audio/media/42", "Pixie Dust"))
    }

    @Test
    fun `a title with a bar in it keeps the whole title`() {
        roundTrip(NotificationSound.Custom("content://media/internal/audio/media/7", "Ping | Pong"))
    }

    @Test
    fun `nothing stored is the system default`() {
        assertEquals(NotificationSound.SystemDefault, parseNotificationSound(null))
    }

    @Test
    fun `garbage is the system default`() {
        assertEquals(NotificationSound.SystemDefault, parseNotificationSound("klaxon"))
    }

    @Test
    fun `a built-in this version does not ship is the system default`() {
        assertEquals(NotificationSound.SystemDefault, parseNotificationSound("builtin:foghorn"))
    }

    @Test
    fun `a custom sound with no uri is the system default`() {
        assertEquals(NotificationSound.SystemDefault, parseNotificationSound("custom:|Mystery"))
    }

    @Test
    fun `a custom sound stored without a title gets a generic one`() {
        assertEquals(
            NotificationSound.Custom("content://x/1", "Custom sound"),
            parseNotificationSound("custom:content://x/1"),
        )
    }

    @Test
    fun `every stream round-trips through storage`() {
        SoundStream.entries.forEach {
            assertEquals(it, parseSoundStream(it.storageKey, legacyAlarmStream = null))
        }
    }

    @Test
    fun `nothing stored plays on the notification stream`() {
        assertEquals(SoundStream.Notification, parseSoundStream(null, legacyAlarmStream = null))
    }

    @Test
    fun `an install that opted into the old alarm switch stays on the alarm stream`() {
        assertEquals(SoundStream.Alarm, parseSoundStream(null, legacyAlarmStream = true))
    }

    @Test
    fun `a stored stream wins over the old alarm switch`() {
        assertEquals(SoundStream.Media, parseSoundStream("media", legacyAlarmStream = true))
    }
}
