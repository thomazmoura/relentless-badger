package com.relentlessbadger.app.scenario

import com.relentlessbadger.app.data.SettingsDto
import com.relentlessbadger.app.scenario.BadgerScenario.Companion.MINUTE
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The scenario clock starts at local midnight, so hours are easy to reach. */
private const val DAY = 24 * 60 * MINUTE

class QuietHoursScenarios : ScenarioTest() {

    @Test
    fun `a nag due inside the quiet hours is armed for when they end`() = scenario {
        givenLocalSettings(60, 15)
        givenQuietHours("22:00-07:00")
        givenOffline()
        whenTimeAdvancesMinutes(23 * 60)

        val task = whenTaskCreated("water plants")

        thenAlarmScheduledAt(task.id, todayAt(7) + DAY)
    }

    @Test
    fun `a daytime nag is left where it is`() = scenario {
        givenLocalSettings(60, 15)
        givenQuietHours("22:00-07:00")
        givenOffline()
        whenTimeAdvancesMinutes(12 * 60)

        val task = whenTaskCreated("water plants")

        thenAlarmScheduledAt(task.id, todayAt(13))
    }

    @Test
    fun `a reminder that lands inside the quiet hours stays silent and waits for the end`() = scenario {
        givenLocalSettings(60, 15)
        givenQuietHours("22:00-07:00")
        givenOffline()
        whenTimeAdvancesMinutes(12 * 60)
        val task = whenTaskCreated("water plants")
        // Armed for 13:00, but the device only wakes up at 23:00.
        whenTimeAdvancesMinutes(11 * 60)

        whenReminderFires(task.id)

        assertTrue("expected no nag during the quiet hours", alarms.shownReminders.isEmpty())
        thenAlarmScheduledAt(task.id, todayAt(7) + DAY)
        // The row still holds the nag it never got, so nothing is lost.
        assertEquals(todayAt(13), localTask(task.id).nextFireAtMillis)
    }

    @Test
    fun `the held-back nag arrives once the quiet hours are over`() = scenario {
        givenLocalSettings(60, 15)
        givenQuietHours("22:00-07:00")
        givenOffline()
        whenTimeAdvancesMinutes(12 * 60)
        val task = whenTaskCreated("water plants")
        whenTimeAdvancesMinutes(11 * 60)
        whenReminderFires(task.id)

        whenTimeAdvancesMinutes(8 * 60)
        whenReminderFires(task.id)

        assertEquals(task.id, alarms.shownReminders.single().task.id)
        thenAlarmScheduledAt(task.id, clock.now() + 15 * MINUTE)
    }

    @Test
    fun `editing the quiet hours moves the alarms already armed`() = scenario {
        givenLocalSettings(60, 15)
        givenOffline()
        whenTimeAdvancesMinutes(12 * 60)
        val task = whenTaskCreated("water plants")
        thenAlarmScheduledAt(task.id, todayAt(13))

        whenSettingsSaved(SettingsDto(60, 15, listOf(60, 240), 0, listOf("12:30-14:00")))

        thenAlarmScheduledAt(task.id, todayAt(14))
    }

    @Test
    fun `switching the quiet hours off puts the alarms back`() = scenario {
        givenLocalSettings(60, 15)
        givenQuietHours("12:30-14:00")
        givenOffline()
        whenTimeAdvancesMinutes(12 * 60)
        val task = whenTaskCreated("water plants")
        thenAlarmScheduledAt(task.id, todayAt(14))

        whenSettingsSaved(SettingsDto(60, 15, listOf(60, 240), 0, emptyList()))

        thenAlarmScheduledAt(task.id, todayAt(13))
    }

    @Test
    fun `a pause that outlasts the quiet hours still decides when the nag comes back`() = scenario {
        givenLocalSettings(60, 15)
        givenQuietHours("22:00-07:00")
        givenOffline()
        whenTimeAdvancesMinutes(12 * 60)
        val task = whenTaskCreated("water plants")
        whenNotificationsPausedUntil(todayAt(8) + DAY)
        whenTimeAdvancesMinutes(11 * 60)

        whenReminderFires(task.id)

        assertTrue("expected no nag while paused", alarms.shownReminders.isEmpty())
        thenAlarmScheduledAt(task.id, todayAt(8) + DAY)
    }

    @Test
    fun `the quiet hours hold a nag back further than the notification spacing would`() = scenario {
        givenLocalSettings(60, 15)
        givenQuietHours("22:00-07:00")
        givenNotificationGapSeconds(5)
        givenOffline()
        whenTimeAdvancesMinutes(12 * 60)
        val task = whenTaskCreated("water plants")
        whenTimeAdvancesMinutes(11 * 60)

        whenReminderFires(task.id)

        assertTrue("expected no nag during the quiet hours", alarms.shownReminders.isEmpty())
        thenAlarmScheduledAt(task.id, todayAt(7) + DAY)
    }

    @Test
    fun `quiet hours travel to the server and come back down`() = scenario {
        whenSettingsSaved(SettingsDto(60, 15, listOf(60, 240), 0, listOf("22:00-07:00")))
        whenSyncRuns()

        assertEquals(
            listOf("22:00-07:00"),
            server.receivedSettingsPuts.single().quietHours,
        )

        server.settings = SettingsDto(60, 15, listOf(60, 240), 0, listOf("23:00-06:00"))
        whenSyncRuns()

        assertEquals(listOf("23:00-06:00"), settingsStore.settings.quietHours)
    }
}
