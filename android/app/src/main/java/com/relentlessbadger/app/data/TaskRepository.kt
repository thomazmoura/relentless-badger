package com.relentlessbadger.app.data

import com.relentlessbadger.app.db.CompletedTaskDao
import com.relentlessbadger.app.db.CompletedTaskEntity
import com.relentlessbadger.app.db.OpenTaskDao
import com.relentlessbadger.app.db.OpenTaskEntity
import com.relentlessbadger.app.db.TitleHistoryDao
import com.relentlessbadger.app.notify.ReminderScheduler
import com.relentlessbadger.app.sync.SyncScheduler
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import retrofit2.HttpException
import java.time.Instant
import java.util.UUID

/**
 * All business logic runs against the local database; the network is only
 * touched inside [sync]. Every mutation commits locally, flags what still
 * needs to reach the API (pendingCreate / pendingDone / settings-dirty) and
 * asks the [SyncScheduler] for a push — so the app is fully usable offline.
 */
class TaskRepository(
    private val apiClient: ApiProvider,
    private val dao: OpenTaskDao,
    private val titleDao: TitleHistoryDao,
    private val completedDao: CompletedTaskDao,
    private val scheduler: ReminderScheduler,
    private val settings: SettingsStore,
    private val syncScheduler: SyncScheduler,
    private val timeSource: TimeSource = TimeSource.SYSTEM,
) {

    /**
     * Serialises firing reminders. Alarms armed for the same instant arrive on
     * separate threads, and the notification spacing in [onReminderFired] is a
     * read-then-write of the same timestamp: without this they would both see
     * the old value and post together, which is exactly what spacing prevents.
     */
    private val reminderLock = Mutex()

    /**
     * Arms the task's alarm. The single place a fire time reaches the platform,
     * so a pause is honoured no matter which mutation computed the time — and
     * the row keeps the time the task actually wants, so resuming restores it.
     */
    private suspend fun arm(task: OpenTaskEntity) {
        scheduler.schedule(
            task.id,
            deferPastPause(task.nextFireAtMillis, settings.current().pauseUntilMillis),
        )
    }

    fun openTasks(): Flow<List<OpenTaskEntity>> = dao.observeActive()

    suspend fun openTask(id: String): OpenTaskEntity? = dao.getById(id)?.takeIf { !it.pendingDone }

    fun completedTasksBetween(fromMillis: Long, toMillis: Long): Flow<List<CompletedTaskEntity>> =
        completedDao.observeBetween(fromMillis, toMillis)

    /**
     * Creates the task locally and schedules its first reminder immediately.
     * The id is minted here so a later push (and any retry of it) is
     * idempotent; the row stays flagged pendingCreate until acknowledged.
     * A [recurrence] requires [firstWarningAtMillis]: that time is the first
     * occurrence and anchors the series' cadence and time-of-day.
     */
    suspend fun addTask(
        title: String,
        firstWarningAtMillis: Long? = null,
        recurrence: Recurrence? = null,
    ): OpenTaskEntity {
        if (recurrence != null) {
            requireNotNull(firstWarningAtMillis) { "a recurring task needs a first occurrence time" }
        }
        val now = timeSource.now()
        val session = settings.current()
        val id = UUID.randomUUID().toString()
        val entity = OpenTaskEntity(
            id = id,
            title = title,
            createdAtMillis = now,
            initialDelayMinutes = session.initialDelayMinutes,
            repeatIntervalMinutes = session.repeatIntervalMinutes,
            firstWarningAtMillis = firstWarningAtMillis,
            nextFireAtMillis = computeNextFire(
                now, session.initialDelayMinutes, session.repeatIntervalMinutes,
                now, firstWarningAtMillis,
            ),
            recurEveryN = recurrence?.everyN,
            recurUnit = recurrence?.unit?.wire(),
            recurDaysOfWeek = recurrence?.takeIf { it.unit == RecurUnit.WEEKS }?.daysOfWeek,
            seriesId = recurrence?.let { id },
            pendingCreate = true,
        )
        dao.upsert(entity)
        arm(entity)
        titleDao.recordUse(title, now)
        syncScheduler.requestSync()
        return entity
    }

    /**
     * Marks the task done locally, so the nagging stops immediately even
     * offline. The row stays flagged pendingDone until a sync pushes it.
     * Completing a recurring task spawns the next occurrence as a fresh
     * pendingCreate row, so recurrence works offline too.
     */
    suspend fun completeTask(id: String) = closeTask(id, cancelled = false)

    /**
     * Closes the task without doing it: same effect as [completeTask] — nagging
     * stops, the record is kept, a recurring occurrence still spawns the next
     * one — but flagged so reports can leave it out.
     */
    suspend fun cancelTask(id: String) = closeTask(id, cancelled = true)

    private suspend fun closeTask(id: String, cancelled: Boolean) {
        val task = dao.getById(id) ?: return
        // Cached before the open row is flagged (and eventually deleted by the
        // sync flush), so the calendar's history survives the completion. It is
        // also what carries `cancelled` until the push happens.
        completedDao.upsert(
            CompletedTaskEntity(task.id, task.title, timeSource.now(), task.seriesId, cancelled),
        )
        dao.markPendingDone(id)
        scheduler.cancel(id)
        task.recurrence()?.let { spawnNextOccurrence(task, it) }
        syncScheduler.requestSync()
    }

    /**
     * The next occurrence's id is derived from the series and its fire time,
     * so a double-complete (or two devices completing the same occurrence)
     * mints the same id and dedupes locally and via the idempotent create.
     */
    private suspend fun spawnNextOccurrence(done: OpenTaskEntity, recurrence: Recurrence) {
        val anchor = done.firstWarningAtMillis ?: done.createdAtMillis
        val nextAt = computeNextOccurrence(anchor, recurrence, afterMillis = timeSource.now())
        val seriesId = done.seriesId ?: done.id
        val nextId = UUID.nameUUIDFromBytes("$seriesId:$nextAt".toByteArray()).toString()
        if (dao.getById(nextId) != null) return
        val next = done.copy(
            id = nextId,
            createdAtMillis = timeSource.now(),
            firstWarningAtMillis = nextAt,
            nextFireAtMillis = nextAt,
            seriesId = seriesId,
            pendingCreate = true,
            pendingDone = false,
            pendingUpdate = false,
        )
        dao.upsert(next)
        arm(next)
        // No titleDao.recordUse: spawns shouldn't inflate suggestion ranks.
    }

    /**
     * Rewrites the task's schedule: when it starts nagging, how often it
     * re-nags, and whether it recurs. Takes effect locally right away and
     * stays flagged pendingUpdate until a sync pushes it. Editing the start
     * time of a recurring task re-anchors the whole series.
     */
    suspend fun editSchedule(
        id: String,
        firstWarningAtMillis: Long?,
        repeatIntervalMinutes: Int,
        recurrence: Recurrence?,
    ) {
        require(repeatIntervalMinutes >= 1) { "repeat interval must be at least 1 minute" }
        if (recurrence != null) {
            requireNotNull(firstWarningAtMillis) { "a recurring task needs a first occurrence time" }
        }
        val task = dao.getById(id) ?: return
        val updated = task.copy(
            firstWarningAtMillis = firstWarningAtMillis,
            repeatIntervalMinutes = repeatIntervalMinutes,
            recurEveryN = recurrence?.everyN,
            recurUnit = recurrence?.unit?.wire(),
            recurDaysOfWeek = recurrence?.takeIf { it.unit == RecurUnit.WEEKS }?.daysOfWeek,
            seriesId = recurrence?.let { task.seriesId ?: task.id },
            nextFireAtMillis = computeNextFire(
                task.createdAtMillis, task.initialDelayMinutes, repeatIntervalMinutes,
                timeSource.now(), firstWarningAtMillis,
            ),
            // Always flagged, even while pendingCreate: if a create response
            // was lost, the server already has the old values and a re-pushed
            // create is ignored idempotently — only the follow-up PUT repairs it.
            pendingUpdate = true,
        )
        dao.upsert(updated)
        arm(updated)
        scheduler.dismissNotification(id)
        syncScheduler.requestSync()
    }

    /**
     * Pushes the next nag out by [minutes] from now, reschedules the alarm and
     * clears the current reminder. Purely local: the new fire time lives in Room
     * and is preserved across syncs, so the server never needs to know.
     */
    suspend fun snoozeTask(id: String, minutes: Int) =
        snoozeUntil(id, timeSource.now() + minutes * 60_000L)

    /**
     * Silences the task until an exact moment picked by the user, with the same
     * local-only semantics as [snoozeTask]: the task's own schedule (start time,
     * interval, recurrence) is untouched, so this defers the nag without
     * rewriting what the task actually is. A time in the past is ignored — it
     * would fire instantly and look like the snooze did nothing.
     */
    suspend fun snoozeUntil(id: String, atMillis: Long) {
        if (atMillis <= timeSource.now()) return
        val task = dao.getById(id) ?: return
        val next = task.copy(nextFireAtMillis = atMillis)
        dao.upsert(next)
        arm(next)
        scheduler.dismissNotification(id)
    }

    /**
     * A reminder alarm fired: show the nag and schedule the next repeat. The
     * chain stops once the task is completed (row removed or pendingDone).
     */
    suspend fun onReminderFired(id: String): Unit = reminderLock.withLock {
        val task = dao.getById(id) ?: return
        if (task.pendingDone) return
        val session = settings.current()
        val now = timeSource.now()
        // The alarm can still land inside a pause: inexact alarms drift, a
        // sleeping device wakes late, and the pause may have started after the
        // alarm was armed. Re-arm instead of nagging through the silence.
        if (session.isPaused(now)) {
            arm(task)
            return
        }
        // Too soon after the last nag: it would stack on top of it in the drawer
        // and hide it. Move only the alarm — the row keeps the time it wants, so
        // the delay is a one-off and never drifts the task's own cadence.
        val slot = nextNotificationSlot(
            now,
            session.lastNotificationAtMillis,
            session.minNotificationGapSeconds,
        )
        if (slot > now) {
            scheduler.schedule(task.id, slot)
            return
        }
        scheduler.showReminder(task, session.defaultWaitMinutes)
        settings.saveLastNotificationAt(now)
        val next = task.copy(
            nextFireAtMillis = now + task.repeatIntervalMinutes * 60_000L,
        )
        dao.upsert(next)
        arm(next)
    }

    /**
     * Re-arms every open task's alarm after a reboot, an app update, or a change
     * to the notification pause. Fire times that passed meanwhile — while the
     * device was off, or while the app was silenced — are nudged one minute out,
     * so resuming lands as a reminder rather than an instant burst.
     */
    suspend fun reArmAlarms() {
        val now = timeSource.now()
        for (task in dao.getActive()) {
            val next = if (task.nextFireAtMillis <= now) {
                task.copy(nextFireAtMillis = now + 60_000L)
            } else {
                task
            }
            dao.upsert(next)
            arm(next)
        }
    }

    /**
     * Silences every reminder until [atMillis]. Tasks keep the fire times they
     * were given — only the armed alarms move — so [resumeNotifications] puts
     * everything back where it was. A time in the past would be a no-op pause.
     */
    suspend fun pauseNotificationsUntil(atMillis: Long) {
        if (atMillis <= timeSource.now()) return
        settings.savePauseUntil(atMillis)
        // Nags already in the drawer would otherwise sit there through the
        // whole pause; they come back when their re-armed alarm fires.
        dao.getActive().forEach { scheduler.dismissNotification(it.id) }
        reArmAlarms()
    }

    suspend fun pauseNotifications(minutes: Int) =
        pauseNotificationsUntil(timeSource.now() + minutes * 60_000L)

    /** Ends the pause early; alarms go straight back to their intended times. */
    suspend fun resumeNotifications() {
        settings.savePauseUntil(null)
        reArmAlarms()
    }

    /**
     * Saves settings locally — they take effect immediately — and flags them
     * dirty until a sync pushes them (last write wins).
     */
    suspend fun updateSettings(newSettings: SettingsDto) {
        settings.saveSettings(newSettings)
        settings.markSettingsDirty()
        syncScheduler.requestSync()
    }

    /**
     * Sets the minimum spacing between notifications; 0 disables it. Kept out of
     * [updateSettings] on purpose — it never travels to the server, so it is
     * neither flagged dirty nor pushed.
     */
    suspend fun updateNotificationGapSeconds(seconds: Int) {
        settings.saveMinNotificationGapSeconds(seconds.coerceAtLeast(0))
    }

    /**
     * Points the app at a new server. Keeps the session and all local data;
     * pending work will sync to the new server.
     */
    suspend fun changeServer(baseUrl: String) {
        val normalized = baseUrl.trim().trimEnd('/')
        require(normalized.isNotBlank()) { "Enter the server URL first." }
        requireNotNull("$normalized/".toHttpUrlOrNull()) {
            "That doesn't look like a valid http(s) URL."
        }
        settings.saveBaseUrl(normalized)
        syncScheduler.requestSync()
    }

    suspend fun titles(): List<String> = titleDao.getRanked()

    /** Hides a title from autocomplete without forgetting it, so sync can't relearn it. */
    suspend fun dismissTitle(title: String) = titleDao.dismiss(title)

    suspend fun restoreTitle(title: String) = titleDao.restore(title)

    /**
     * Push local changes, then pull server state. Each phase leaves the data
     * consistent if a later one fails: pending flags survive until their push
     * is acknowledged, and the pull never removes rows with pending changes.
     * Network errors propagate so callers (worker/UI) can retry or report.
     */
    suspend fun sync() {
        pushPendingCreates()
        pushPendingUpdates()
        flushPendingCompletions()
        pushSettingsIfDirty()

        val remote = apiClient.api().getTasks("open")
        val known = dao.getAll().associateBy { it.id }
        val entities = remote.map { dto ->
            val local = known[dto.id] ?: return@map dto.toEntity(timeSource.now())
            // Local pending changes win until pushed; otherwise adopt schedule
            // edits made on other devices while preserving the local nag state.
            if (local.pendingCreate || local.pendingUpdate || local.pendingDone) {
                local
            } else {
                local.mergeServerSchedule(dto, timeSource.now())
            }
        }
        dao.upsertAll(entities)
        val remoteIds = remote.map { it.id }.toSet()
        known.values
            .filter { !it.pendingDone && !it.pendingCreate && it.id !in remoteIds }
            .forEach { scheduler.cancel(it.id) }
        dao.deleteSyncedNotIn(remoteIds.ifEmpty { setOf("") }.toList())

        // Completion history for the calendar. Append-only IGNORE: a completion
        // pushed moments ago comes straight back with the server's timestamp,
        // but the locally cached row (with the truthful local time) wins. The
        // full history is small; add a `since` param server-side if it grows.
        val done = apiClient.api().getTasks("done")
        completedDao.insertIgnoring(
            done.mapNotNull { dto ->
                val completedAt = dto.completedAt ?: return@mapNotNull null
                CompletedTaskEntity(
                    dto.id, dto.title, Instant.parse(completedAt).toEpochMilli(), dto.seriesId,
                    dto.cancelled,
                )
            },
        )

        titleDao.upsertFromServer(apiClient.api().getTitles(), timeSource.now())
        pullSettingsIfClean()

        dao.getActive().forEach { arm(it) }
    }

    suspend fun signOut() {
        // Best-effort flush so queued offline work isn't silently dropped.
        try {
            sync()
        } catch (_: Exception) {
        }
        dao.getAll().forEach { scheduler.cancel(it.id) }
        dao.clear()
        titleDao.clear()
        completedDao.clear()
    }

    private suspend fun pushPendingCreates() {
        for (task in dao.getPendingCreate()) {
            try {
                apiClient.api().createTask(
                    CreateTaskRequest(
                        title = task.title,
                        firstWarningAt = task.firstWarningAtMillis
                            ?.let { Instant.ofEpochMilli(it).toString() },
                        id = task.id,
                        createdAt = Instant.ofEpochMilli(task.createdAtMillis).toString(),
                        initialDelayMinutes = task.initialDelayMinutes,
                        repeatIntervalMinutes = task.repeatIntervalMinutes,
                        recurEveryN = task.recurEveryN,
                        recurUnit = task.recurUnit,
                        recurDaysOfWeek = task.recurDaysOfWeek,
                        seriesId = task.seriesId,
                    ),
                )
                dao.clearPendingCreate(task.id)
            } catch (e: HttpException) {
                when {
                    e.code() == 401 -> throw e
                    // Id taken by another user; give the task a fresh one and
                    // let the next sync push it. Practically unreachable.
                    e.code() == 409 -> {
                        val reborn = task.copy(id = UUID.randomUUID().toString())
                        dao.delete(task.id)
                        scheduler.cancel(task.id)
                        dao.upsert(reborn)
                        arm(reborn)
                    }
                    // Other 4xx would repeat forever; drop the flag instead of
                    // wedging sync. 5xx: keep the flag and retry next sync.
                    e.code() in 400..499 -> dao.clearPendingCreate(task.id)
                }
            }
        }
    }

    private suspend fun pushPendingUpdates() {
        for (task in dao.getPendingUpdate()) {
            try {
                apiClient.api().updateTaskSchedule(
                    task.id,
                    UpdateTaskScheduleRequest(
                        firstWarningAt = task.firstWarningAtMillis
                            ?.let { Instant.ofEpochMilli(it).toString() },
                        repeatIntervalMinutes = task.repeatIntervalMinutes,
                        recurEveryN = task.recurEveryN,
                        recurUnit = task.recurUnit,
                        recurDaysOfWeek = task.recurDaysOfWeek,
                        seriesId = task.seriesId,
                    ),
                )
                dao.clearPendingUpdate(task.id)
            } catch (e: HttpException) {
                when {
                    e.code() == 401 -> throw e
                    // 404: gone remotely (completed/deleted elsewhere) — the
                    // edit is moot and the pull will prune the row. Other 4xx
                    // would repeat forever; drop the flag instead of wedging
                    // sync. 5xx: keep the flag and retry next sync.
                    e.code() in 400..499 -> dao.clearPendingUpdate(task.id)
                }
            }
        }
    }

    private suspend fun flushPendingCompletions() {
        for (task in dao.getPendingDone()) {
            try {
                // The cached completion row holds the moment the task was
                // actually completed on this device (and whether it was
                // cancelled); without it the server would stamp the completion
                // with the sync time and record it as done.
                val cached = completedDao.getById(task.id)
                apiClient.api().completeTask(
                    task.id,
                    CompleteTaskRequest(
                        cached?.completedAtMillis?.let { Instant.ofEpochMilli(it).toString() },
                        cancelled = cached?.cancelled ?: false,
                    ),
                )
                dao.delete(task.id)
            } catch (e: HttpException) {
                when {
                    e.code() == 401 -> throw e
                    // Gone on the server already; stop retrying.
                    e.code() == 404 -> dao.delete(task.id)
                }
            }
        }
    }

    private suspend fun pushSettingsIfDirty() {
        if (!settings.isSettingsDirty()) return
        val session = settings.current()
        apiClient.api().updateSettings(
            SettingsDto(
                session.initialDelayMinutes, session.repeatIntervalMinutes,
                session.waitMinutes, session.defaultWaitIndex,
            ),
        )
        settings.clearSettingsDirty()
    }

    private suspend fun pullSettingsIfClean() {
        if (settings.isSettingsDirty()) return
        settings.saveSettings(apiClient.api().getSettings())
    }
}

fun TaskDto.toEntity(nowMillis: Long): OpenTaskEntity {
    val createdAtMillis = Instant.parse(createdAt).toEpochMilli()
    val firstWarningAtMillis = firstWarningAt?.let { Instant.parse(it).toEpochMilli() }
    return OpenTaskEntity(
        id = id,
        title = title,
        createdAtMillis = createdAtMillis,
        initialDelayMinutes = initialDelayMinutes,
        repeatIntervalMinutes = repeatIntervalMinutes,
        firstWarningAtMillis = firstWarningAtMillis,
        nextFireAtMillis = computeNextFire(
            createdAtMillis, initialDelayMinutes, repeatIntervalMinutes,
            nowMillis, firstWarningAtMillis,
        ),
        recurEveryN = recurEveryN,
        recurUnit = recurUnit,
        recurDaysOfWeek = recurDaysOfWeek,
        seriesId = seriesId,
    )
}

/**
 * Adopts the server's schedule (start time, nag interval, recurrence) into a
 * local row with no pending changes. The live fire time is only recomputed
 * when the schedule actually changed — an unchanged pull must not clobber a
 * local snooze.
 */
fun OpenTaskEntity.mergeServerSchedule(dto: TaskDto, nowMillis: Long): OpenTaskEntity {
    val dtoFirstWarningAtMillis = dto.firstWarningAt?.let { Instant.parse(it).toEpochMilli() }
    val scheduleChanged = dtoFirstWarningAtMillis != firstWarningAtMillis ||
        dto.repeatIntervalMinutes != repeatIntervalMinutes
    return copy(
        firstWarningAtMillis = dtoFirstWarningAtMillis,
        repeatIntervalMinutes = dto.repeatIntervalMinutes,
        recurEveryN = dto.recurEveryN,
        recurUnit = dto.recurUnit,
        recurDaysOfWeek = dto.recurDaysOfWeek,
        seriesId = dto.seriesId,
        nextFireAtMillis = if (scheduleChanged) {
            computeNextFire(
                createdAtMillis, initialDelayMinutes, dto.repeatIntervalMinutes,
                nowMillis, dtoFirstWarningAtMillis,
            )
        } else {
            nextFireAtMillis
        },
    )
}

/**
 * First reminder fires at [firstWarningAtMillis] when set, otherwise initialDelay
 * after creation; afterwards it repeats every repeatInterval. Returns the earliest
 * slot in the future.
 */
fun computeNextFire(
    createdAtMillis: Long,
    initialDelayMinutes: Int,
    repeatIntervalMinutes: Int,
    nowMillis: Long,
    firstWarningAtMillis: Long? = null,
): Long {
    val first = firstWarningAtMillis ?: (createdAtMillis + initialDelayMinutes * 60_000L)
    if (first > nowMillis) return first
    val interval = repeatIntervalMinutes * 60_000L
    val periodsElapsed = (nowMillis - first) / interval + 1
    return first + periodsElapsed * interval
}
