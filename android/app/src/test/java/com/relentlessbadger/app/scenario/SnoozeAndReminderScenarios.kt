package com.relentlessbadger.app.scenario

import com.relentlessbadger.app.scenario.BadgerScenario.Companion.MINUTE
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SnoozeAndReminderScenarios : ScenarioTest() {

    @Test
    fun `a snooze pushes the next nag out, dismisses the notification and never touches the server`() = scenario {
        givenLocalSettings(60, 15, waitMinutes = listOf(90, 300))
        givenOffline()
        val task = whenTaskCreated("water plants")

        whenSnoozed(task.id, 90)

        assertEquals(clock.now() + 90 * MINUTE, localTask(task.id).nextFireAtMillis)
        thenAlarmScheduledAt(task.id, clock.now() + 90 * MINUTE)
        assertTrue(alarms.dismissed.contains(task.id))
        thenNothingPushed()
    }

    @Test
    fun `any configured wait works the same way, however far out it reaches`() = scenario {
        givenLocalSettings(60, 15, waitMinutes = listOf(15, 90, 300, 480))
        givenOffline()
        val task = whenTaskCreated("water plants")

        whenSnoozed(task.id, 480)

        assertEquals(clock.now() + 480 * MINUTE, localTask(task.id).nextFireAtMillis)
        thenAlarmScheduledAt(task.id, clock.now() + 480 * MINUTE)
        thenNothingPushed()
    }

    @Test
    fun `snoozing until an exact time parks the nag there without rewriting the schedule`() = scenario {
        givenOffline()
        val task = whenTaskCreated("water plants")
        val tomorrowMorning = clock.now() + 17 * 60 * MINUTE

        whenSnoozedUntil(task.id, tomorrowMorning)

        val snoozed = localTask(task.id)
        assertEquals(tomorrowMorning, snoozed.nextFireAtMillis)
        // The task itself is untouched: same start time, same nag interval.
        assertEquals(task.firstWarningAtMillis, snoozed.firstWarningAtMillis)
        assertEquals(task.repeatIntervalMinutes, snoozed.repeatIntervalMinutes)
        thenAlarmScheduledAt(task.id, tomorrowMorning)
        assertTrue(alarms.dismissed.contains(task.id))
        thenNothingPushed()
    }

    @Test
    fun `snoozing until a time in the past is ignored rather than firing instantly`() = scenario {
        givenOffline()
        val task = whenTaskCreated("water plants")

        whenSnoozedUntil(task.id, clock.now() - 5 * MINUTE)

        assertEquals(task.nextFireAtMillis, localTask(task.id).nextFireAtMillis)
    }

    @Test
    fun `a snooze survives a sync - the local nag time is preserved over the server's view`() = scenario {
        val task = givenSyncedTask("water plants")

        whenSnoozed(task.id, 30)
        whenSyncRuns()

        assertEquals(clock.now() + 30 * MINUTE, localTask(task.id).nextFireAtMillis)
        thenAlarmScheduledAt(task.id, clock.now() + 30 * MINUTE)
    }

    @Test
    fun `a task pulled long after its first warning lands on the next repeat slot in the future`() = scenario {
        // Created 100 min ago, first fire at +60, repeating every 15: slots at
        // +60/+75/+90/+105 — the next one in the future is 5 min from now.
        server.seedOpenTask(
            "old task",
            createdAtMillis = clock.now() - 100 * MINUTE,
            initialDelayMinutes = 60,
            repeatIntervalMinutes = 15,
        )

        whenSyncRuns()

        val task = taskDao.getActive().single()
        assertEquals(clock.now() + 5 * MINUTE, task.nextFireAtMillis)
    }

    @Test
    fun `when a reminder fires it offers the default wait and schedules the next repeat`() = scenario {
        // The notification's one-tap button uses the wait the user marked default,
        // which is not necessarily the first one in the list.
        givenLocalSettings(60, 15, waitMinutes = listOf(15, 45, 120), defaultWaitIndex = 1)
        givenOffline()
        val task = whenTaskCreated("water plants")
        whenTimeAdvancesMinutes(60)

        whenReminderFires(task.id)

        val shown = alarms.shownReminders.single()
        assertEquals(task.id, shown.task.id)
        assertEquals(45, shown.defaultWaitMinutes)
        assertEquals(clock.now() + 15 * MINUTE, localTask(task.id).nextFireAtMillis)
        thenAlarmScheduledAt(task.id, clock.now() + 15 * MINUTE)
    }

    @Test
    fun `an out-of-range default index falls back to the first wait instead of crashing`() = scenario {
        // A stale default can outlive the wait it pointed at, e.g. a shorter list
        // arriving from another device.
        givenLocalSettings(60, 15, waitMinutes = listOf(20, 90), defaultWaitIndex = 5)
        givenOffline()
        val task = whenTaskCreated("water plants")
        whenTimeAdvancesMinutes(60)

        whenReminderFires(task.id)

        assertEquals(20, alarms.shownReminders.single().defaultWaitMinutes)
    }

    @Test
    fun `a stale alarm for an already-completed task shows nothing and stops the chain`() = scenario {
        givenOffline()
        val task = whenTaskCreated("water plants")
        whenTaskCompleted(task.id)

        whenReminderFires(task.id)

        assertTrue("no nag for a completed task", alarms.shownReminders.isEmpty())
        thenNoAlarmArmed(task.id)
    }
}
