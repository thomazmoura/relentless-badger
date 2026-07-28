package com.relentlessbadger.app.scenario

import com.relentlessbadger.app.scenario.BadgerScenario.Companion.MINUTE
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PauseNotificationsScenarios : ScenarioTest() {

    @Test
    fun `pausing holds every nag back until the pause ends`() = scenario {
        givenLocalSettings(60, 15)
        givenOffline()
        val a = whenTaskCreated("water plants")
        val b = whenTaskCreated("call mum")

        whenNotificationsPaused(120)

        thenAlarmScheduledAt(a.id, clock.now() + 120 * MINUTE)
        thenAlarmScheduledAt(b.id, clock.now() + 120 * MINUTE)
        thenNothingPushed()
    }

    @Test
    fun `a paused task keeps the fire time it actually wants`() = scenario {
        givenLocalSettings(60, 15)
        givenOffline()
        val task = whenTaskCreated("water plants")

        whenNotificationsPaused(120)

        // Only the armed alarm moved; the task still knows it is due in an hour,
        // which is what makes resuming a pure restore.
        assertEquals(clock.now() + 60 * MINUTE, localTask(task.id).nextFireAtMillis)
    }

    @Test
    fun `pausing clears the nags already sitting in the drawer`() = scenario {
        givenLocalSettings(60, 15)
        givenOffline()
        val task = whenTaskCreated("water plants")
        whenTimeAdvancesMinutes(60)
        whenReminderFires(task.id)

        whenNotificationsPaused(120)

        assertTrue(alarms.dismissed.contains(task.id))
    }

    @Test
    fun `a reminder that fires during the pause stays silent and re-arms for the end`() = scenario {
        givenLocalSettings(60, 15)
        givenOffline()
        val task = whenTaskCreated("water plants")
        val pauseEnd = clock.now() + 120 * MINUTE
        whenNotificationsPaused(120)
        whenTimeAdvancesMinutes(60)

        whenReminderFires(task.id)

        assertTrue("expected no reminder while paused", alarms.shownReminders.isEmpty())
        thenAlarmScheduledAt(task.id, pauseEnd)
        // The nag interval hasn't started counting: the task is still owed the
        // reminder it never got.
        assertEquals(pauseEnd - 60 * MINUTE, localTask(task.id).nextFireAtMillis)
    }

    @Test
    fun `resuming puts every alarm back where it was`() = scenario {
        givenLocalSettings(60, 15)
        givenOffline()
        val task = whenTaskCreated("water plants")
        whenNotificationsPaused(120)

        whenNotificationsResumed()

        assertNull(settingsStore.pauseUntilMillis)
        thenAlarmScheduledAt(task.id, clock.now() + 60 * MINUTE)
    }

    @Test
    fun `resuming after the moment has passed nags a minute later, not instantly`() = scenario {
        givenLocalSettings(60, 15)
        givenOffline()
        val task = whenTaskCreated("water plants")
        whenNotificationsPaused(120)
        whenTimeAdvancesMinutes(60)

        whenNotificationsResumed()

        thenAlarmScheduledAt(task.id, clock.now() + MINUTE)
    }

    @Test
    fun `a task created during the pause waits for it to end too`() = scenario {
        givenLocalSettings(60, 15)
        givenOffline()
        val pauseEnd = clock.now() + 120 * MINUTE
        whenNotificationsPaused(120)

        val task = whenTaskCreated("water plants")

        thenAlarmScheduledAt(task.id, pauseEnd)
    }

    @Test
    fun `a reboot during the pause re-arms for the end of the pause`() = scenario {
        givenLocalSettings(60, 15)
        givenOffline()
        val task = whenTaskCreated("water plants")
        val pauseEnd = clock.now() + 120 * MINUTE
        whenNotificationsPaused(120)

        whenBootReArmRuns()

        thenAlarmScheduledAt(task.id, pauseEnd)
    }

    @Test
    fun `a sync neither ends the pause nor pushes it to the server`() = scenario {
        val task = givenSyncedTask("water plants")
        val pauseEnd = clock.now() + 120 * MINUTE
        whenNotificationsPaused(120)

        whenSyncRuns()

        assertEquals(pauseEnd, settingsStore.pauseUntilMillis)
        thenAlarmScheduledAt(task.id, pauseEnd)
        assertTrue("a pause is local to the device", server.receivedSettingsPuts.isEmpty())
    }

    @Test
    fun `pausing until a moment in the past is ignored rather than silencing nothing`() = scenario {
        givenLocalSettings(60, 15)
        givenOffline()
        val task = whenTaskCreated("water plants")

        whenNotificationsPausedUntil(clock.now() - 5 * MINUTE)

        assertNull(settingsStore.pauseUntilMillis)
        thenAlarmScheduledAt(task.id, clock.now() + 60 * MINUTE)
    }

    @Test
    fun `an expired pause lets reminders through again on its own`() = scenario {
        givenLocalSettings(60, 15)
        givenOffline()
        val task = whenTaskCreated("water plants")
        whenNotificationsPaused(30)
        whenTimeAdvancesMinutes(60)

        whenReminderFires(task.id)

        assertEquals(task.id, alarms.shownReminders.single().task.id)
        thenAlarmScheduledAt(task.id, clock.now() + 15 * MINUTE)
    }
}
