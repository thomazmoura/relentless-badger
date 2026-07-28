package com.relentlessbadger.app.ui

import android.content.Context
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.relentlessbadger.app.AppContainer
import com.relentlessbadger.app.BuildConfig
import com.relentlessbadger.app.auth.GoogleSignIn
import com.relentlessbadger.app.data.LoginRequest
import com.relentlessbadger.app.data.Recurrence
import com.relentlessbadger.app.data.SettingsDto
import com.relentlessbadger.app.db.CompletedTaskEntity
import com.relentlessbadger.app.db.OpenTaskEntity
import com.relentlessbadger.app.fuzzy.Fuzzy
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId

class AppViewModel(private val container: AppContainer) : ViewModel() {

    val session = container.session.sessionFlow
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    val openTasks: StateFlow<List<OpenTaskEntity>> = container.repository.openTasks()
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    /** Month shown in the calendar tab. */
    private val calendarMonthFlow = MutableStateFlow(YearMonth.now())
    val calendarMonth = calendarMonthFlow.asStateFlow()

    var selectedCalendarDate by mutableStateOf<LocalDate>(LocalDate.now())

    /** Cancelled tasks are history, but not achievements — opt in to see them. */
    var showCancelledInCalendar by mutableStateOf(false)

    fun showCalendarMonth(month: YearMonth) {
        calendarMonthFlow.value = month
        val today = LocalDate.now()
        selectedCalendarDate = if (YearMonth.from(today) == month) today else month.atDay(1)
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    val completedInMonth: StateFlow<List<CompletedTaskEntity>> = calendarMonthFlow
        .flatMapLatest { month ->
            val zone = ZoneId.systemDefault()
            container.repository.completedTasksBetween(
                month.atDay(1).atStartOfDay(zone).toInstant().toEpochMilli(),
                month.plusMonths(1).atDay(1).atStartOfDay(zone).toInstant().toEpochMilli(),
            )
        }
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    var quickAddText by mutableStateOf("")

    /** Optional absolute time (epoch millis) for the next task's first reminder. */
    var quickAddFirstWarningAtMillis by mutableStateOf<Long?>(null)

    /** Optional recurrence rule for the next task; requires a first-reminder time. */
    var quickAddRecurrence by mutableStateOf<Recurrence?>(null)

    /** Task whose schedule is being edited in the dialog, if any. */
    var editingTask by mutableStateOf<OpenTaskEntity?>(null)

    /**
     * Task whose wait options are being picked in the anchorless dialog, if any.
     * The row's own snooze button uses a dropdown with local state instead; this
     * is for the reminder notification's "Other…" action, which has no anchor.
     */
    var waitPickerTask by mutableStateOf<OpenTaskEntity?>(null)

    /**
     * Task waiting on an exact date and time. Hosted at the MainScreen top level
     * so scrolling its row out of the list can't dispose the picker.
     */
    var exactWaitTask by mutableStateOf<OpenTaskEntity?>(null)

    var titleHistory by mutableStateOf<List<String>>(emptyList())
        private set
    val suggestions by derivedStateOf {
        if (quickAddText.isBlank()) emptyList()
        else Fuzzy.rank(quickAddText, titleHistory).filterNot { it.equals(quickAddText, ignoreCase = true) }
    }

    /** Title just removed from suggestions, awaiting its undo snackbar. */
    var dismissedSuggestion by mutableStateOf<String?>(null)

    var busy by mutableStateOf(false)
        private set
    var errorMessage by mutableStateOf<String?>(null)

    val devLoginAvailable: Boolean get() = BuildConfig.GOOGLE_WEB_CLIENT_ID.isBlank()

    fun signInWithGoogle(activityContext: Context, baseUrl: String) {
        signIn(baseUrl) { GoogleSignIn.getIdToken(activityContext, BuildConfig.GOOGLE_WEB_CLIENT_ID) }
    }

    /** Backend dev-bypass login for LAN testing before Google OAuth is configured. */
    fun signInAsDev(baseUrl: String) {
        signIn(baseUrl) { "dev-token" }
    }

    private fun signIn(baseUrl: String, idTokenProvider: suspend () -> String) {
        if (baseUrl.isBlank()) {
            errorMessage = "Enter the server URL first."
            return
        }
        launchBusy {
            container.session.saveBaseUrl(baseUrl)
            val idToken = idTokenProvider()
            val response = container.apiClient.api().login(LoginRequest(idToken))
            container.session.saveLogin(response.token, response.email, response.settings)
            refresh()
        }
    }

    /**
     * Syncs with the backend. Being offline is normal now, so connectivity
     * errors are only surfaced when the user explicitly asked ([interactive]);
     * everything else (e.g. a rejected session) is always shown.
     */
    fun refresh(interactive: Boolean = false) {
        viewModelScope.launch {
            try {
                container.repository.sync()
            } catch (e: Exception) {
                if (interactive || e !is java.io.IOException) {
                    errorMessage = e.friendly()
                }
            }
            titleHistory = container.repository.titles()
        }
    }

    fun addTask(title: String = quickAddText) {
        val trimmed = title.trim()
        if (trimmed.isEmpty()) return
        val firstWarningAtMillis = quickAddFirstWarningAtMillis
        val recurrence = quickAddRecurrence
        if (recurrence != null && firstWarningAtMillis == null) {
            // The UI routes through the date picker first; this is a backstop.
            errorMessage = "Pick a start time for a repeating task."
            return
        }
        quickAddText = ""
        quickAddFirstWarningAtMillis = null
        quickAddRecurrence = null
        launchBusy {
            container.repository.addTask(trimmed, firstWarningAtMillis, recurrence)
            titleHistory = container.repository.titles()
        }
    }

    /** Drops a title from autocomplete. Not [launchBusy]: it mustn't block adding. */
    fun dismissSuggestion(title: String) {
        viewModelScope.launch {
            container.repository.dismissTitle(title)
            titleHistory = container.repository.titles()
            dismissedSuggestion = title
        }
    }

    fun undoDismissSuggestion(title: String) {
        viewModelScope.launch {
            container.repository.restoreTitle(title)
            titleHistory = container.repository.titles()
        }
    }

    fun completeTask(id: String) {
        viewModelScope.launch {
            container.repository.completeTask(id)
        }
    }

    fun cancelTask(id: String) {
        viewModelScope.launch {
            container.repository.cancelTask(id)
        }
    }

    fun beginEditSchedule(task: OpenTaskEntity) {
        editingTask = task
    }

    fun saveSchedule(
        id: String,
        firstWarningAtMillis: Long?,
        repeatIntervalMinutes: Int,
        recurrence: Recurrence?,
    ) {
        editingTask = null
        launchBusy {
            container.repository.editSchedule(id, firstWarningAtMillis, repeatIntervalMinutes, recurrence)
        }
    }

    /**
     * Opens the wait picker for a task named by the reminder notification's
     * "Other…" action. Silently does nothing if the task is already gone — it
     * was completed elsewhere while the notification lingered.
     */
    fun openWaitPicker(id: String) {
        viewModelScope.launch {
            waitPickerTask = container.repository.openTask(id)
        }
    }

    fun snoozeTask(id: String, minutes: Int) {
        viewModelScope.launch {
            container.repository.snoozeTask(id, minutes)
        }
    }

    fun snoozeUntil(id: String, atMillis: Long) {
        viewModelScope.launch {
            container.repository.snoozeUntil(id, atMillis)
        }
    }

    fun pauseNotifications(minutes: Int) {
        viewModelScope.launch {
            container.repository.pauseNotifications(minutes)
        }
    }

    fun pauseNotificationsUntil(atMillis: Long) {
        viewModelScope.launch {
            container.repository.pauseNotificationsUntil(atMillis)
        }
    }

    fun resumeNotifications() {
        viewModelScope.launch {
            container.repository.resumeNotifications()
        }
    }

    fun saveSettings(
        initialDelayMinutes: Int,
        repeatIntervalMinutes: Int,
        waitMinutes: List<Int>,
        defaultWaitIndex: Int,
        onDone: () -> Unit,
    ) {
        launchBusy {
            container.repository.updateSettings(
                SettingsDto(initialDelayMinutes, repeatIntervalMinutes, waitMinutes, defaultWaitIndex),
            )
            onDone()
        }
    }

    fun changeServerUrl(url: String) {
        launchBusy {
            container.repository.changeServer(url)
        }
    }

    fun signOut() {
        launchBusy {
            container.repository.signOut()
            container.session.clear()
            quickAddText = ""
            quickAddFirstWarningAtMillis = null
            quickAddRecurrence = null
            editingTask = null
            titleHistory = emptyList()
        }
    }

    fun canScheduleExactAlarms(): Boolean = container.scheduler.canScheduleExact()

    private fun launchBusy(block: suspend () -> Unit) {
        viewModelScope.launch {
            busy = true
            try {
                block()
            } catch (e: Exception) {
                errorMessage = e.friendly()
            } finally {
                busy = false
            }
        }
    }

    companion object {
        fun factory(container: AppContainer): ViewModelProvider.Factory = viewModelFactory {
            initializer { AppViewModel(container) }
        }
    }
}

private fun Exception.friendly(): String = when (this) {
    is java.net.ConnectException, is java.net.SocketTimeoutException ->
        "Cannot reach the server. Check the URL and your network."
    is retrofit2.HttpException -> when (code()) {
        401 -> "Session rejected by the server. Try signing in again."
        else -> "Server error (${code()})."
    }
    else -> message ?: "Something went wrong."
}
