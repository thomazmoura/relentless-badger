package com.relentlessbadger.app.data

import kotlinx.serialization.Serializable

@Serializable
data class LoginRequest(val idToken: String)

// waitMinutes is the ordered list of snooze options offered on a task and its
// reminder; defaultWaitIndex picks the one the notification's one-tap Wait
// button uses. At most MAX_WAITS entries — see Session.waitMinutes.
// quietHours holds "HH:mm-HH:mm" windows where reminders are held back; empty
// means switched off. Defaulted so a response from a server that predates a
// field still deserialises.
@Serializable
data class SettingsDto(
    val initialDelayMinutes: Int,
    val repeatIntervalMinutes: Int,
    val waitMinutes: List<Int> = DEFAULT_WAIT_MINUTES,
    val defaultWaitIndex: Int = 0,
    val quietHours: List<String> = emptyList(),
)

const val MAX_WAITS = 6
val DEFAULT_WAIT_MINUTES = listOf(60, 240)

@Serializable
data class LoginResponse(
    val token: String,
    val email: String,
    val name: String? = null,
    val settings: SettingsDto,
)

@Serializable
data class CreateTaskRequest(
    val title: String,
    val firstWarningAt: String? = null,
    // Set when pushing an offline-created task: the client-minted id makes the
    // push idempotent, the rest preserves the original creation time and the
    // settings snapshot the task was created under.
    val id: String? = null,
    val createdAt: String? = null,
    val initialDelayMinutes: Int? = null,
    val repeatIntervalMinutes: Int? = null,
    // Recurrence rule; recurDaysOfWeek is a bitmask (bit 0 = Monday .. bit 6 =
    // Sunday) used only when recurUnit is "weeks". The server just stores it.
    val recurEveryN: Int? = null,
    val recurUnit: String? = null,
    val recurDaysOfWeek: Int? = null,
    val seriesId: String? = null,
)

// Carries when the task was actually completed on the device, so a completion
// flushed by a later sync keeps its true time; null means "now". cancelled
// closes the task without crediting it as done.
@Serializable
data class CompleteTaskRequest(
    val completedAt: String? = null,
    val cancelled: Boolean = false,
)

// Full-state schedule update: null on a nullable field means "clear it".
@Serializable
data class UpdateTaskScheduleRequest(
    val firstWarningAt: String?,
    val repeatIntervalMinutes: Int,
    val recurEveryN: Int?,
    val recurUnit: String?,
    val recurDaysOfWeek: Int?,
    val seriesId: String?,
)

@Serializable
data class TaskDto(
    val id: String,
    val title: String,
    val createdAt: String,
    val completedAt: String? = null,
    val initialDelayMinutes: Int,
    val repeatIntervalMinutes: Int,
    val firstWarningAt: String? = null,
    val recurEveryN: Int? = null,
    val recurUnit: String? = null,
    val recurDaysOfWeek: Int? = null,
    val seriesId: String? = null,
    // Only meaningful with completedAt set: the task was closed, not done.
    val cancelled: Boolean = false,
)
