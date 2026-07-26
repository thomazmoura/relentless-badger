package com.relentlessbadger.app.scenario

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import androidx.work.NetworkType
import androidx.work.WorkManager
import androidx.work.testing.WorkManagerTestInitHelper
import com.relentlessbadger.app.data.SettingsDto
import com.relentlessbadger.app.sync.WorkManagerSyncScheduler
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

class MutationsRequestSyncScenarios : ScenarioTest() {

    @Test
    fun `every local mutation asks for a background sync`() = scenario {
        givenOffline()

        val task = whenTaskCreated("water plants")
        assertEquals(1, syncRequests.requests)

        whenTaskCompleted(task.id)
        assertEquals(2, syncRequests.requests)

        whenSettingsSaved(SettingsDto(30, 5, listOf(90, 300), 0))
        assertEquals(3, syncRequests.requests)
    }
}

/**
 * The one wiring test that earns its keep: the CONNECTED constraint on the
 * enqueued work IS the "push as soon as connectivity returns" feature.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class WorkSchedulingScenarios {

    @Test
    fun `requesting a sync enqueues unique work gated on connectivity`() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        WorkManagerTestInitHelper.initializeTestWorkManager(context)

        WorkManagerSyncScheduler(context).requestSync()

        val work = WorkManager.getInstance(context)
            .getWorkInfosForUniqueWork(WorkManagerSyncScheduler.SYNC_WORK)
            .get()
            .single()
        assertEquals(NetworkType.CONNECTED, work.constraints.requiredNetworkType)
    }

    @Test
    fun `the periodic safety-net pull is registered once with the same connectivity gate`() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        WorkManagerTestInitHelper.initializeTestWorkManager(context)

        val scheduler = WorkManagerSyncScheduler(context)
        scheduler.ensurePeriodic()
        scheduler.ensurePeriodic() // idempotent

        val work = WorkManager.getInstance(context)
            .getWorkInfosForUniqueWork(WorkManagerSyncScheduler.PERIODIC_WORK)
            .get()
        assertEquals(1, work.size)
        assertTrue(work.single().periodicityInfo != null)
        assertEquals(NetworkType.CONNECTED, work.single().constraints.requiredNetworkType)
    }
}
