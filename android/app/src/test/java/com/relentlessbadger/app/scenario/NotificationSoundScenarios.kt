package com.relentlessbadger.app.scenario

import com.relentlessbadger.app.data.NotificationSound
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
}
