package com.relentlessbadger.app.scenario

import com.relentlessbadger.app.scenario.BadgerScenario.Companion.MINUTE
import com.relentlessbadger.app.scenario.BadgerScenario.Companion.SECOND
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationSpacingScenarios : ScenarioTest() {

    @Test
    fun `two tasks due together nag one at a time`() = scenario {
        givenLocalSettings(60, 15)
        givenNotificationGapSeconds(5)
        givenOffline()
        val first = whenTaskCreated("water plants")
        val second = whenTaskCreated("call mum")
        whenTimeAdvancesMinutes(60)

        whenReminderFires(first.id)
        whenReminderFires(second.id)

        assertEquals(first.id, alarms.shownReminders.single().task.id)
        thenAlarmScheduledAt(second.id, clock.now() + 5 * SECOND)
    }

    @Test
    fun `the held-back nag arrives once the gap has passed`() = scenario {
        givenLocalSettings(60, 15)
        givenNotificationGapSeconds(5)
        givenOffline()
        val first = whenTaskCreated("water plants")
        val second = whenTaskCreated("call mum")
        whenTimeAdvancesMinutes(60)
        whenReminderFires(first.id)
        whenReminderFires(second.id)

        whenTimeAdvancesSeconds(5)
        whenReminderFires(second.id)

        assertEquals(
            listOf(first.id, second.id),
            alarms.shownReminders.map { it.task.id },
        )
        // Its own nag cycle starts from when it was actually shown.
        thenAlarmScheduledAt(second.id, clock.now() + 15 * MINUTE)
    }

    @Test
    fun `a delayed nag keeps the fire time the task actually wants`() = scenario {
        givenLocalSettings(60, 15)
        givenNotificationGapSeconds(5)
        givenOffline()
        val first = whenTaskCreated("water plants")
        val second = whenTaskCreated("call mum")
        val due = clock.now() + 60 * MINUTE
        whenTimeAdvancesMinutes(60)
        whenReminderFires(first.id)

        whenReminderFires(second.id)

        // Only the armed alarm moved: the row is still owed the reminder it
        // never got, so the spacing can't drift its cadence.
        assertEquals(due, localTask(second.id).nextFireAtMillis)
    }

    @Test
    fun `a burst of three unwinds one gap at a time`() = scenario {
        givenLocalSettings(60, 15)
        givenNotificationGapSeconds(5)
        givenOffline()
        val a = whenTaskCreated("water plants")
        val b = whenTaskCreated("call mum")
        val c = whenTaskCreated("pay rent")
        whenTimeAdvancesMinutes(60)

        whenReminderFires(a.id)
        whenReminderFires(b.id)
        whenReminderFires(c.id)
        // Both were pushed to the same slot; whoever fires first there takes it
        // and the other is pushed on again.
        whenTimeAdvancesSeconds(5)
        whenReminderFires(b.id)
        whenReminderFires(c.id)
        whenTimeAdvancesSeconds(5)
        whenReminderFires(c.id)

        assertEquals(
            listOf(a.id, b.id, c.id),
            alarms.shownReminders.map { it.task.id },
        )
    }

    @Test
    fun `a gap of zero lets simultaneous nags through untouched`() = scenario {
        givenLocalSettings(60, 15)
        givenNotificationGapSeconds(0)
        givenOffline()
        val first = whenTaskCreated("water plants")
        val second = whenTaskCreated("call mum")
        whenTimeAdvancesMinutes(60)

        whenReminderFires(first.id)
        whenReminderFires(second.id)

        assertEquals(
            listOf(first.id, second.id),
            alarms.shownReminders.map { it.task.id },
        )
    }

    @Test
    fun `spacing does not hold a nag back when nothing came before it`() = scenario {
        givenLocalSettings(60, 15)
        givenNotificationGapSeconds(5)
        givenOffline()
        val task = whenTaskCreated("water plants")
        whenTimeAdvancesMinutes(60)

        whenReminderFires(task.id)

        assertEquals(task.id, alarms.shownReminders.single().task.id)
        thenAlarmScheduledAt(task.id, clock.now() + 15 * MINUTE)
    }

    @Test
    fun `a pause still wins over the spacing`() = scenario {
        givenLocalSettings(60, 15)
        givenNotificationGapSeconds(5)
        givenOffline()
        val first = whenTaskCreated("water plants")
        val second = whenTaskCreated("call mum")
        whenTimeAdvancesMinutes(60)
        whenReminderFires(first.id)
        val pauseEnd = clock.now() + 120 * MINUTE
        whenNotificationsPaused(120)

        whenReminderFires(second.id)

        assertEquals(first.id, alarms.shownReminders.single().task.id)
        thenAlarmScheduledAt(second.id, pauseEnd)
    }

    @Test
    fun `the gap stays on the device instead of syncing`() = scenario {
        givenSyncedTask("water plants")

        givenNotificationGapSeconds(30)
        whenSyncRuns()

        assertEquals(30, settingsStore.minNotificationGapSeconds)
        assertTrue(
            "notification spacing is local to the device",
            server.receivedSettingsPuts.isEmpty(),
        )
    }
}
