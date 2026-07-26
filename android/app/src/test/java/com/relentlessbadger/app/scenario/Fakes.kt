package com.relentlessbadger.app.scenario

import com.relentlessbadger.app.data.BadgerApi
import com.relentlessbadger.app.data.CompleteTaskRequest
import com.relentlessbadger.app.data.CreateTaskRequest
import com.relentlessbadger.app.data.LoginRequest
import com.relentlessbadger.app.data.LoginResponse
import com.relentlessbadger.app.data.Session
import com.relentlessbadger.app.data.SettingsDto
import com.relentlessbadger.app.data.SettingsStore
import com.relentlessbadger.app.data.TaskDto
import com.relentlessbadger.app.data.TimeSource
import com.relentlessbadger.app.data.UpdateTaskScheduleRequest
import com.relentlessbadger.app.db.OpenTaskEntity
import com.relentlessbadger.app.notify.ReminderScheduler
import com.relentlessbadger.app.sync.SyncScheduler
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import retrofit2.HttpException
import retrofit2.Response
import java.net.ConnectException
import java.time.Instant
import java.util.UUID

fun httpError(code: Int): HttpException =
    HttpException(Response.error<Any>(code, "{}".toResponseBody("application/json".toMediaType())))

/**
 * In-memory stand-in for the backend, mirroring its behavior: per-id
 * idempotent creates, 404 on completing unknown tasks, titles ordered by
 * frequency. `online = false` makes every call fail like a dead network.
 */
class FakeBadgerApi(private val clock: TimeSource) : BadgerApi {

    var online = true
    var unauthorized = false

    /** Server stores the task but the response never reaches the client. */
    var dropCreateResponses = false
    var failCreatesWithServerError = false
    var failTaskPull = false
    var failSettingsPush = false

    var settings = SettingsDto(60, 15, listOf(60, 240), 0)
    val tasks = linkedMapOf<String, TaskDto>()

    val receivedCreates = mutableListOf<CreateTaskRequest>()
    val receivedCompletions = mutableListOf<String>()
    val receivedSettingsPuts = mutableListOf<SettingsDto>()
    val receivedScheduleUpdates = mutableListOf<Pair<String, UpdateTaskScheduleRequest>>()

    fun openTasks(): List<TaskDto> = tasks.values.filter { it.completedAt == null }

    fun doneTasks(): List<TaskDto> = tasks.values.filter { it.completedAt != null }

    /** A completion that happened elsewhere (e.g. on another device). */
    fun seedCompletedTask(
        title: String,
        completedAtMillis: Long,
        id: String = UUID.randomUUID().toString(),
        createdAtMillis: Long = completedAtMillis,
        seriesId: String? = null,
    ): TaskDto {
        val dto = seedOpenTask(
            title,
            id = id,
            createdAtMillis = createdAtMillis,
            seriesId = seriesId,
        ).copy(completedAt = Instant.ofEpochMilli(completedAtMillis).toString())
        tasks[id] = dto
        return dto
    }

    fun seedOpenTask(
        title: String,
        id: String = UUID.randomUUID().toString(),
        createdAtMillis: Long = clock.now(),
        initialDelayMinutes: Int = settings.initialDelayMinutes,
        repeatIntervalMinutes: Int = settings.repeatIntervalMinutes,
        firstWarningAtMillis: Long? = null,
        recurEveryN: Int? = null,
        recurUnit: String? = null,
        recurDaysOfWeek: Int? = null,
        seriesId: String? = null,
    ): TaskDto {
        val dto = TaskDto(
            id = id,
            title = title,
            createdAt = Instant.ofEpochMilli(createdAtMillis).toString(),
            completedAt = null,
            initialDelayMinutes = initialDelayMinutes,
            repeatIntervalMinutes = repeatIntervalMinutes,
            firstWarningAt = firstWarningAtMillis?.let { Instant.ofEpochMilli(it).toString() },
            recurEveryN = recurEveryN,
            recurUnit = recurUnit,
            recurDaysOfWeek = recurDaysOfWeek,
            seriesId = seriesId,
        )
        tasks[id] = dto
        return dto
    }

    private fun gate() {
        if (!online) throw ConnectException("offline")
        if (unauthorized) throw httpError(401)
    }

    override suspend fun login(request: LoginRequest): LoginResponse =
        throw UnsupportedOperationException("not exercised by repository scenarios")

    override suspend fun getSettings(): SettingsDto {
        gate()
        return settings
    }

    override suspend fun updateSettings(settings: SettingsDto): SettingsDto {
        gate()
        if (failSettingsPush) throw httpError(500)
        receivedSettingsPuts += settings
        this.settings = settings
        return settings
    }

    override suspend fun getTasks(status: String): List<TaskDto> {
        gate()
        if (failTaskPull) throw ConnectException("connection dropped mid-sync")
        return if (status == "done") doneTasks() else openTasks()
    }

    override suspend fun createTask(request: CreateTaskRequest): TaskDto {
        gate()
        if (failCreatesWithServerError) throw httpError(500)
        receivedCreates += request
        request.id?.let { id -> tasks[id]?.let { return it } } // idempotent retry
        val dto = TaskDto(
            id = request.id ?: UUID.randomUUID().toString(),
            title = request.title.trim(),
            createdAt = request.createdAt ?: Instant.ofEpochMilli(clock.now()).toString(),
            completedAt = null,
            initialDelayMinutes = request.initialDelayMinutes ?: settings.initialDelayMinutes,
            repeatIntervalMinutes = request.repeatIntervalMinutes ?: settings.repeatIntervalMinutes,
            firstWarningAt = request.firstWarningAt,
            recurEveryN = request.recurEveryN,
            recurUnit = request.recurUnit,
            recurDaysOfWeek = request.recurDaysOfWeek,
            seriesId = request.seriesId,
        )
        tasks[dto.id] = dto
        if (dropCreateResponses) throw ConnectException("response lost")
        return dto
    }

    override suspend fun updateTaskSchedule(id: String, request: UpdateTaskScheduleRequest): TaskDto {
        gate()
        val task = tasks[id] ?: throw httpError(404)
        receivedScheduleUpdates += id to request
        val updated = task.copy(
            firstWarningAt = request.firstWarningAt,
            repeatIntervalMinutes = request.repeatIntervalMinutes,
            recurEveryN = request.recurEveryN,
            recurUnit = request.recurUnit,
            recurDaysOfWeek = request.recurDaysOfWeek,
            seriesId = request.seriesId,
        )
        tasks[id] = updated
        return updated
    }

    override suspend fun completeTask(id: String, request: CompleteTaskRequest): TaskDto {
        gate()
        val task = tasks[id] ?: throw httpError(404)
        receivedCompletions += id
        val done = task.copy(
            completedAt = request.completedAt ?: Instant.ofEpochMilli(clock.now()).toString(),
        )
        tasks[id] = done
        return done
    }

    override suspend fun deleteTask(id: String): Response<Unit> =
        throw UnsupportedOperationException("not exercised by repository scenarios")

    override suspend fun getTitles(): List<String> {
        gate()
        return tasks.values
            .groupBy { it.title }
            .entries
            .sortedWith(
                compareByDescending<Map.Entry<String, List<TaskDto>>> { it.value.size }
                    .thenByDescending { entry -> entry.value.maxOf { it.createdAt } },
            )
            .map { it.key }
    }
}

class MutableClock(var nowMillis: Long) : TimeSource {
    override fun now(): Long = nowMillis
    fun advanceMinutes(minutes: Int) {
        nowMillis += minutes * 60_000L
    }
}

class RecordingReminderScheduler : ReminderScheduler {
    /** taskId -> fire time of the currently armed alarm. */
    val scheduled = linkedMapOf<String, Long>()
    val cancelled = mutableListOf<String>()
    val dismissed = mutableListOf<String>()
    val shownReminders = mutableListOf<ShownReminder>()

    data class ShownReminder(val task: OpenTaskEntity, val defaultWaitMinutes: Int)

    override fun canScheduleExact(): Boolean = true

    override fun schedule(task: OpenTaskEntity) {
        scheduled[task.id] = task.nextFireAtMillis
    }

    override fun cancel(taskId: String) {
        scheduled.remove(taskId)
        cancelled += taskId
    }

    override fun dismissNotification(taskId: String) {
        dismissed += taskId
    }

    override fun showReminder(task: OpenTaskEntity, defaultWaitMinutes: Int) {
        shownReminders += ShownReminder(task, defaultWaitMinutes)
    }
}

class RecordingSyncScheduler : SyncScheduler {
    var requests = 0
        private set

    override fun requestSync() {
        requests++
    }
}

class FakeSettingsStore : SettingsStore {
    var settings = SettingsDto(60, 15, listOf(60, 240), 0)
    var dirty = false
    var baseUrl = "http://badger.test"

    override suspend fun current(): Session = Session(
        baseUrl = baseUrl,
        token = "test-jwt",
        email = "test@example.com",
        initialDelayMinutes = settings.initialDelayMinutes,
        repeatIntervalMinutes = settings.repeatIntervalMinutes,
        waitMinutes = settings.waitMinutes,
        defaultWaitIndex = settings.defaultWaitIndex,
    )

    override suspend fun saveBaseUrl(baseUrl: String) {
        this.baseUrl = baseUrl
    }

    override suspend fun saveSettings(settings: SettingsDto) {
        this.settings = settings
    }

    override suspend fun markSettingsDirty() {
        dirty = true
    }

    override suspend fun clearSettingsDirty() {
        dirty = false
    }

    override suspend fun isSettingsDirty(): Boolean = dirty
}
