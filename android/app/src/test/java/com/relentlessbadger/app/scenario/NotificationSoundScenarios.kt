package com.relentlessbadger.app.scenario

import com.relentlessbadger.app.data.NotificationSound
import com.relentlessbadger.app.data.SoundStream
import com.relentlessbadger.app.data.SettingsDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class NotificationSoundScenarios : ScenarioTest() {

    @Test
    fun `a fresh install nags with the system sound`() = scenario {
        givenLocalSettings(60, 15)
        givenOffline()
        val task = whenTaskCreated("water plants")
        whenTimeAdvancesMinutes(60)

        whenReminderFires(task.id)

        assertEquals(NotificationSound.SystemDefault, alarms.shownReminders.single().sound)
    }

    @Test
    fun `the next nag rings with the chosen sound`() = scenario {
        givenLocalSettings(60, 15)
        givenOffline()
        val task = whenTaskCreated("water plants")
        whenTimeAdvancesMinutes(60)

        whenNotificationSoundChosen(NotificationSound.BuiltIn("simple-01"))
        whenReminderFires(task.id)

        assertEquals(NotificationSound.BuiltIn("simple-01"), alarms.shownReminders.single().sound)
    }

    @Test
    fun `a sound picked from the device is the one that rings`() = scenario {
        val picked = NotificationSound.Custom("content://media/internal/audio/media/42", "Pixie Dust")
        givenLocalSettings(60, 15)
        givenNotificationSound(picked)
        givenOffline()
        val task = whenTaskCreated("water plants")
        whenTimeAdvancesMinutes(60)

        whenReminderFires(task.id)

        assertEquals(picked, alarms.shownReminders.single().sound)
    }

    @Test
    fun `silent still nags, it only drops the sound`() = scenario {
        givenLocalSettings(60, 15)
        givenNotificationSound(NotificationSound.Silent)
        givenOffline()
        val task = whenTaskCreated("water plants")
        whenTimeAdvancesMinutes(60)

        whenReminderFires(task.id)

        val shown = alarms.shownReminders.single()
        assertEquals(task.id, shown.task.id)
        assertEquals(NotificationSound.Silent, shown.sound)
    }

    @Test
    fun `the test notification rings with the chosen sound`() = scenario {
        givenNotificationSound(NotificationSound.BuiltIn("ambient"))
        givenOffline()

        whenTestNotificationRequested()

        assertEquals(listOf(NotificationSound.BuiltIn("ambient")), alarms.testNotificationSounds)
    }

    @Test
    fun `choosing a sound stays on this device`() = scenario {
        givenOnline()

        whenNotificationSoundChosen(NotificationSound.BuiltIn("high-intensity"))
        whenSyncRuns()

        assertFalse(settingsStore.isSettingsDirty())
        thenNothingPushed()
    }

    @Test
    fun `a settings pull leaves the chosen sound alone`() = scenario {
        givenNotificationSound(NotificationSound.BuiltIn("decorative-01"))
        server.settings = SettingsDto(45, 20, listOf(120, 480), 1)

        whenSyncRuns()

        assertEquals(
            NotificationSound.BuiltIn("decorative-01"),
            settingsStore.current().notificationSound,
        )
    }

    @Test
    fun `a fresh install rings at notification volume`() = scenario {
        givenLocalSettings(60, 15)
        givenOffline()
        val task = whenTaskCreated("water plants")
        whenTimeAdvancesMinutes(60)

        whenReminderFires(task.id)

        assertEquals(SoundStream.Notification, alarms.shownReminders.single().stream)
    }

    @Test
    fun `choosing the alarm stream rings the next nag at alarm volume`() = scenario {
        givenLocalSettings(60, 15)
        givenNotificationSound(NotificationSound.BuiltIn("simple-01"))
        givenOffline()
        val task = whenTaskCreated("water plants")
        whenTimeAdvancesMinutes(60)

        whenSoundStreamChosen(SoundStream.Alarm)
        whenReminderFires(task.id)

        val shown = alarms.shownReminders.single()
        assertEquals(NotificationSound.BuiltIn("simple-01"), shown.sound)
        assertEquals(SoundStream.Alarm, shown.stream)
    }

    @Test
    fun `choosing the media stream rings the next nag at media volume`() = scenario {
        givenLocalSettings(60, 15)
        givenOffline()
        val task = whenTaskCreated("water plants")
        whenTimeAdvancesMinutes(60)

        whenSoundStreamChosen(SoundStream.Media)
        whenReminderFires(task.id)

        assertEquals(SoundStream.Media, alarms.shownReminders.single().stream)
    }

    @Test
    fun `the test notification rings on the chosen stream`() = scenario {
        givenSoundStream(SoundStream.Media)
        givenOffline()

        whenTestNotificationRequested()

        assertEquals(listOf(SoundStream.Media), alarms.testNotificationStreams)
    }

    @Test
    fun `the chosen stream stays on this device`() = scenario {
        givenOnline()

        whenSoundStreamChosen(SoundStream.Alarm)
        whenSyncRuns()

        assertFalse(settingsStore.isSettingsDirty())
        thenNothingPushed()
    }

    @Test
    fun `a settings pull leaves the chosen stream alone`() = scenario {
        givenSoundStream(SoundStream.Alarm)
        server.settings = SettingsDto(45, 20, listOf(120, 480), 1)

        whenSyncRuns()

        assertEquals(SoundStream.Alarm, settingsStore.current().soundStream)
    }
}
