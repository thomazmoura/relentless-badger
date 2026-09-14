package com.relentlessbadger.app.scenario

import com.relentlessbadger.app.scenario.BadgerScenario.Companion.MINUTE
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The debug button in Advanced settings. It is a delivery check, not a
 * reminder, so it answers to none of the gates a real nag respects and leaves
 * no trace on the schedule.
 */
class TestNotificationScenarios : ScenarioTest() {

    @Test
    fun `the test notification carries the configured default wait`() = scenario {
        givenLocalSettings(60, 15, waitMinutes = listOf(30, 120), defaultWaitIndex = 1)
        givenOffline()

        whenTestNotificationRequested()

        assertEquals(listOf(120), alarms.testNotifications)
    }

    @Test
    fun `a pause does not silence the test notification`() = scenario {
        givenLocalSettings(60, 15)
        givenOffline()
        whenNotificationsPaused(120)

        whenTestNotificationRequested()

        assertEquals(listOf(60), alarms.testNotifications)
    }

    @Test
    fun `quiet hours do not silence the test notification`() = scenario {
        givenLocalSettings(60, 15)
        givenQuietHours("23:00-07:00")
        givenOffline()

        whenTestNotificationRequested()

        assertEquals(listOf(60), alarms.testNotifications)
    }

    @Test
    fun `the minimum gap does not hold the test notification back`() = scenario {
        givenLocalSettings(60, 15)
        givenNotificationGapSeconds(300)
        givenOffline()
        val task = whenTaskCreated("water plants")
        whenTimeAdvancesMinutes(60)
        whenReminderFires(task.id)

        whenTestNotificationRequested()

        assertEquals(listOf(60), alarms.testNotifications)
    }

    @Test
    fun `a test notification never delays a real nag`() = scenario {
        givenLocalSettings(60, 15)
        givenNotificationGapSeconds(300)
        givenOffline()
        val task = whenTaskCreated("water plants")
        val armedFor = clock.now() + 60 * MINUTE

        whenTestNotificationRequested()

        // Nothing about the schedule moved: no nag was recorded as sent, so the
        // spacing still measures from the last real one.
        assertNull(settingsStore.lastNotificationAtMillis)
        assertEquals(armedFor, localTask(task.id).nextFireAtMillis)
        thenAlarmScheduledAt(task.id, armedFor)
        assertEquals(0, alarms.shownReminders.size)
    }
}
