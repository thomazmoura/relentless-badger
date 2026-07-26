package com.relentlessbadger.app.scenario

import android.app.Application
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.relentlessbadger.app.data.Recurrence
import com.relentlessbadger.app.data.SettingsDto
import com.relentlessbadger.app.data.TaskDto
import com.relentlessbadger.app.data.TaskRepository
import com.relentlessbadger.app.db.BadgerDb
import com.relentlessbadger.app.db.CompletedTaskEntity
import com.relentlessbadger.app.db.OpenTaskEntity
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Given/When/Then harness for the app's business logic: a real repository on a
 * real in-memory Room database, with the network, clock, alarms and settings
 * replaced by controllable fakes. Scenarios read as user-visible behavior;
 * none of them care how the repository is wired internally.
 */
class BadgerScenario {

    val clock = MutableClock(START_OF_TIME)
    val server = FakeBadgerApi(clock)
    val alarms = RecordingReminderScheduler()
    val settingsStore = FakeSettingsStore()
    val syncRequests = RecordingSyncScheduler()

    private val db = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext<Application>(),
        BadgerDb::class.java,
    ).allowMainThreadQueries().build()

    val taskDao = db.openTaskDao()
    val titleDao = db.titleHistoryDao()
    val completedDao = db.completedTaskDao()

    val repository = TaskRepository(
        apiClient = { server },
        dao = taskDao,
        titleDao = titleDao,
        completedDao = completedDao,
        scheduler = alarms,
        settings = settingsStore,
        syncScheduler = syncRequests,
        timeSource = clock,
    )

    // --- Given ---

    fun givenOffline() {
        server.online = false
    }

    fun givenOnline() {
        server.online = true
    }

    fun givenServerHasOpenTask(title: String, firstWarningAtMillis: Long? = null): TaskDto =
        server.seedOpenTask(title, firstWarningAtMillis = firstWarningAtMillis)

    fun givenServerHasCompletedTask(title: String, completedAtMillis: Long): TaskDto =
        server.seedCompletedTask(title, completedAtMillis)

    suspend fun givenLocalSettings(
        initialDelayMinutes: Int,
        repeatIntervalMinutes: Int,
        waitMinutes: List<Int> = listOf(60, 240),
        defaultWaitIndex: Int = 0,
    ) {
        settingsStore.saveSettings(
            SettingsDto(initialDelayMinutes, repeatIntervalMinutes, waitMinutes, defaultWaitIndex),
        )
    }

    /** A task known to both sides with no pending local changes. */
    suspend fun givenSyncedTask(title: String): OpenTaskEntity {
        val dto = server.seedOpenTask(title)
        repository.sync()
        return localTask(dto.id)
    }

    // --- When ---

    suspend fun whenTaskCreated(
        title: String,
        firstWarningAtMillis: Long? = null,
        recurrence: Recurrence? = null,
    ): OpenTaskEntity = repository.addTask(title, firstWarningAtMillis, recurrence)

    suspend fun whenTaskCompleted(id: String) = repository.completeTask(id)

    suspend fun whenScheduleEdited(
        id: String,
        firstWarningAtMillis: Long?,
        repeatIntervalMinutes: Int,
        recurrence: Recurrence? = null,
    ) = repository.editSchedule(id, firstWarningAtMillis, repeatIntervalMinutes, recurrence)

    suspend fun whenSnoozed(id: String, minutes: Int) = repository.snoozeTask(id, minutes)

    suspend fun whenSnoozedUntil(id: String, atMillis: Long) = repository.snoozeUntil(id, atMillis)

    suspend fun whenReminderFires(id: String) = repository.onReminderFired(id)

    suspend fun whenBootReArmRuns() = repository.reArmAlarms()

    suspend fun whenSettingsSaved(settings: SettingsDto) = repository.updateSettings(settings)

    suspend fun whenServerUrlChanged(url: String) = repository.changeServer(url)

    suspend fun whenServerUrlChangeFailsWith(url: String) {
        try {
            repository.changeServer(url)
        } catch (_: IllegalArgumentException) {
            return
        }
        fail("expected the server URL change to be rejected")
    }

    suspend fun whenSyncRuns() = repository.sync()

    suspend fun whenSyncFailsWith(check: (Exception) -> Boolean = { true }) {
        try {
            repository.sync()
        } catch (e: Exception) {
            assertTrue("sync failed with unexpected ${e::class.simpleName}: $e", check(e))
            return
        }
        fail("expected sync to fail")
    }

    fun whenTimeAdvancesMinutes(minutes: Int) = clock.advanceMinutes(minutes)

    // --- Then ---

    suspend fun openTaskTitles(): List<String> = taskDao.getActive().map { it.title }

    suspend fun localTask(id: String): OpenTaskEntity =
        taskDao.getById(id) ?: error("no local task with id $id")

    suspend fun localTaskByTitle(title: String): OpenTaskEntity =
        taskDao.getAll().firstOrNull { it.title == title }
            ?: error("no local task titled '$title'")

    suspend fun thenTaskVisible(title: String) {
        assertTrue("expected '$title' in the open list", openTaskTitles().contains(title))
    }

    suspend fun thenTaskGone(title: String) {
        assertTrue("expected '$title' gone from the open list", !openTaskTitles().contains(title))
    }

    fun thenAlarmScheduledAt(id: String, expectedFireAtMillis: Long) {
        assertEquals("armed alarm for $id", expectedFireAtMillis, alarms.scheduled[id])
    }

    fun thenNoAlarmArmed(id: String) {
        assertNull("expected no armed alarm for $id", alarms.scheduled[id])
    }

    fun thenServerHasOpenTask(title: String) {
        assertTrue(
            "expected server to list '$title' as open",
            server.openTasks().any { it.title == title },
        )
    }

    fun thenServerDoesNotHaveOpenTask(title: String) {
        assertTrue(
            "expected server not to list '$title' as open",
            server.openTasks().none { it.title == title },
        )
    }

    suspend fun completedCache(): List<CompletedTaskEntity> =
        completedDao.observeBetween(Long.MIN_VALUE, Long.MAX_VALUE).first()

    suspend fun thenCompletionCached(title: String, atMillis: Long? = null) {
        val entry = completedCache().firstOrNull { it.title == title }
            ?: error("expected a cached completion titled '$title'")
        if (atMillis != null) {
            assertEquals("cached completion time for '$title'", atMillis, entry.completedAtMillis)
        }
    }

    suspend fun thenNoCompletionCached(title: String) {
        assertTrue(
            "expected no cached completion titled '$title'",
            completedCache().none { it.title == title },
        )
    }

    fun thenNothingPushed() {
        assertTrue("expected no creates pushed", server.receivedCreates.isEmpty())
        assertTrue("expected no completions pushed", server.receivedCompletions.isEmpty())
        assertTrue("expected no settings pushed", server.receivedSettingsPuts.isEmpty())
        assertTrue("expected no schedule updates pushed", server.receivedScheduleUpdates.isEmpty())
    }

    fun close() = db.close()

    companion object {
        /** 2026-01-01T00:00:00Z — scenarios reason in offsets from here. */
        const val START_OF_TIME = 1_767_225_600_000L
        const val MINUTE = 60_000L
    }
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
abstract class ScenarioTest {

    protected lateinit var badger: BadgerScenario

    @Before
    fun createScenario() {
        badger = BadgerScenario()
    }

    @After
    fun closeScenario() {
        badger.close()
    }

    protected fun scenario(block: suspend BadgerScenario.() -> Unit) = runBlocking {
        badger.block()
    }
}
