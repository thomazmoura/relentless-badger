package com.relentlessbadger.app.ui

import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.text.format.DateFormat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Snooze
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDefaults
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.relentlessbadger.app.data.DEFAULT_WAIT_MINUTES
import com.relentlessbadger.app.data.PAUSE_OPTIONS_MINUTES
import com.relentlessbadger.app.data.QuietRange
import com.relentlessbadger.app.data.deferPastPause
import com.relentlessbadger.app.data.deferPastQuietHours
import com.relentlessbadger.app.data.parseWaitDuration
import com.relentlessbadger.app.data.Recurrence
import com.relentlessbadger.app.data.RecurUnit
import com.relentlessbadger.app.data.recurrence
import com.relentlessbadger.app.db.OpenTaskEntity
import kotlinx.coroutines.delay
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale
import java.util.concurrent.TimeUnit

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    viewModel: AppViewModel,
    onOpenSettings: () -> Unit,
    requestNotificationPermission: () -> Unit,
) {
    val tasks by viewModel.openTasks.collectAsState()
    val session by viewModel.session.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current
    val s = LocalStrings.current
    val use24Hour = DateFormat.is24HourFormat(context)
    val waitMinutes = session?.waitMinutes ?: DEFAULT_WAIT_MINUTES
    // Ticks so the "next nag" countdowns stay current, scheduled tasks move into
    // the active section when their start time passes, and an expiring pause
    // releases the UI on its own — all without any data change.
    val nowMillis by produceState(System.currentTimeMillis()) {
        while (true) {
            delay(15_000)
            value = System.currentTimeMillis()
        }
    }
    val pauseUntilMillis = session?.pauseUntilMillis?.takeIf { it > nowMillis }
    val quietHours = session?.quietHours.orEmpty()
    var pausePickerOpen by remember { mutableStateOf(false) }
    val movementGuard = remember { RowMovementGuard() }
    // Mirrors the guard's lock for drawing. The taps themselves still ask the
    // guard, since this only catches up a frame after the rows move.
    var tapsLocked by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        requestNotificationPermission()
        viewModel.refresh()
    }

    LaunchedEffect(viewModel.errorMessage) {
        viewModel.errorMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.errorMessage = null
        }
    }

    LaunchedEffect(viewModel.dismissedSuggestion) {
        viewModel.dismissedSuggestion?.let { title ->
            val result = snackbarHostState.showSnackbar(
                message = s.removedFromSuggestions(title),
                actionLabel = s.undo,
            )
            if (result == SnackbarResult.ActionPerformed) {
                viewModel.undoDismissSuggestion(title)
            }
            viewModel.dismissedSuggestion = null
        }
    }

    LaunchedEffect(viewModel.concludedTask) {
        viewModel.concludedTask?.let { concluded ->
            val result = snackbarHostState.showSnackbar(
                message = if (concluded.cancelled) {
                    s.concludedCancelled(concluded.task.title)
                } else {
                    s.concludedDone(concluded.task.title)
                },
                actionLabel = s.undo,
                duration = SnackbarDuration.Long,
            )
            if (result == SnackbarResult.ActionPerformed) {
                viewModel.undoConclusion(concluded)
            }
            viewModel.concludedTask = null
        }
    }

    LaunchedEffect(viewModel.batchConclusion) {
        viewModel.batchConclusion?.let { batch ->
            val result = snackbarHostState.showSnackbar(
                message = s.batchConcluded(batch.count),
                actionLabel = s.undo,
                duration = SnackbarDuration.Long,
            )
            if (result == SnackbarResult.ActionPerformed) {
                viewModel.undoBatchConclusion(batch)
            }
            viewModel.batchConclusion = null
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(s.appName) },
                actions = {
                    IconButton(onClick = { viewModel.doneEarlierPicking = true }) {
                        Icon(Icons.Filled.DoneAll, contentDescription = s.doneEarlier)
                    }
                    PauseMenuButton(
                        pauseUntilMillis = pauseUntilMillis,
                        use24Hour = use24Hour,
                        onPause = { minutes -> viewModel.pauseNotifications(minutes) },
                        onPickDateTime = { pausePickerOpen = true },
                        onResume = { viewModel.resumeNotifications() },
                    )
                    IconButton(onClick = { viewModel.refresh(interactive = true) }) {
                        Icon(Icons.Filled.Refresh, contentDescription = s.sync)
                    }
                    IconButton(onClick = onOpenSettings) {
                        Icon(Icons.Filled.Settings, contentDescription = s.settings)
                    }
                },
            )
        },
        // Suggestions are dismissed with the keyboard up, and edge-to-edge means
        // adjustResize doesn't lift the window — so the undo snackbar has to
        // dodge the IME itself or it appears behind it.
        snackbarHost = { SnackbarHost(snackbarHostState, modifier = Modifier.imePadding()) },
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .padding(horizontal = 16.dp),
        ) {
            if (!viewModel.canScheduleExactAlarms() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                Card(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                    Column(Modifier.padding(12.dp)) {
                        Text(
                            s.exactAlarmsDisabled,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        TextButton(onClick = {
                            context.startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM))
                        }) {
                            Text(s.allowExactAlarms)
                        }
                    }
                }
            }

            // The icon alone is easy to miss, and a silent app with no visible
            // reason for the silence is exactly the bug this feature could look like.
            pauseUntilMillis?.let { until ->
                Card(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(start = 12.dp),
                    ) {
                        Text(
                            s.remindersPausedUntil(formatDateTime(until, use24Hour, s)),
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.weight(1f),
                        )
                        TextButton(onClick = { viewModel.resumeNotifications() }) {
                            Text(s.resume)
                        }
                    }
                }
            }

            QuickAdd(viewModel, use24Hour)

            Spacer(Modifier.height(8.dp))

            // Hoisted above the empty branch so emptying and refilling the list
            // doesn't lose the state.
            val listState = rememberLazyListState()
            LaunchedEffect(viewModel.taskListResetToken) {
                if (viewModel.taskListResetToken > 0) listState.animateScrollToItem(0)
            }

            // Keyed on the start time, not nextFire, so a snoozed task
            // doesn't jump into "Scheduled". Today's remaining load sits right
            // under the nagging rows; everything past midnight is pushed below
            // it, where it can't be mistaken for something still owed today.
            val endOfToday = LocalDate.now()
                .plusDays(1)
                .atStartOfDay(ZoneId.systemDefault())
                .toInstant()
                .toEpochMilli()
            val active = mutableListOf<OpenTaskEntity>()
            val scheduledToday = mutableListOf<OpenTaskEntity>()
            val scheduledLater = mutableListOf<OpenTaskEntity>()
            tasks.forEach { task ->
                val start = task.firstWarningAtMillis ?: 0L
                when {
                    start <= nowMillis -> active += task
                    start < endOfToday -> scheduledToday += task
                    else -> scheduledLater += task
                }
            }
            val keys = rowKeys(
                active.map { it.id },
                scheduledToday.map { it.id },
                scheduledLater.map { it.id },
            )
            // Rows are keyed so each one's state stays with its task, but LazyColumn
            // anchors its scroll on the first visible item's key — the viewport
            // would chase whichever row moved, and rows move on their own as a
            // fired nag or a sync rewrites the time the list sorts by. Pinning the
            // current index before the new rows are measured holds the viewport
            // instead: whoever is two rows down stays two rows down. A scroll in
            // flight is left alone, since that is the add-task jump to the top.
            SideEffect {
                if (!movementGuard.observe(keys)) return@SideEffect
                if (!listState.isScrollInProgress) {
                    listState.requestScrollToItem(
                        listState.firstVisibleItemIndex,
                        listState.firstVisibleItemScrollOffset,
                    )
                }
                if (!movementGuard.allowsTap()) tapsLocked = true
            }
            // Lifts the locked look when the guard lets taps through again.
            // Re-asks the guard after each wait, because a further move while
            // locked pushes the end back.
            LaunchedEffect(tapsLocked) {
                if (!tapsLocked) return@LaunchedEffect
                while (true) {
                    val remaining = movementGuard.tapLockRemainingMillis()
                    if (remaining == 0L) break
                    delay(remaining)
                }
                tapsLocked = false
            }

            if (tasks.isEmpty()) {
                Column(
                    modifier = Modifier.fillMaxSize(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Spacer(Modifier.height(64.dp))
                    Text(s.nothingPending, style = MaterialTheme.typography.titleMedium)
                    Text(
                        s.nothingPendingHint,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            } else {
                LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                    taskRows(
                        tasks = active,
                        scheduled = false,
                        viewModel = viewModel,
                        nowMillis = nowMillis,
                        pauseUntilMillis = pauseUntilMillis,
                        quietHours = quietHours,
                        use24Hour = use24Hour,
                        waitMinutes = waitMinutes,
                        movementGuard = movementGuard,
                        tapsLocked = tapsLocked,
                    )
                    if (scheduledToday.isNotEmpty()) {
                        item(key = SCHEDULED_TODAY_HEADER_KEY) { TaskSectionHeader(s.scheduledToday) }
                        taskRows(
                            tasks = scheduledToday,
                            scheduled = true,
                            viewModel = viewModel,
                            nowMillis = nowMillis,
                            pauseUntilMillis = pauseUntilMillis,
                            quietHours = quietHours,
                            use24Hour = use24Hour,
                            waitMinutes = waitMinutes,
                            movementGuard = movementGuard,
                            tapsLocked = tapsLocked,
                        )
                    }
                    if (scheduledLater.isNotEmpty()) {
                        item(key = SCHEDULED_LATER_HEADER_KEY) { TaskSectionHeader(s.scheduledLater) }
                        taskRows(
                            tasks = scheduledLater,
                            scheduled = true,
                            viewModel = viewModel,
                            nowMillis = nowMillis,
                            pauseUntilMillis = pauseUntilMillis,
                            quietHours = quietHours,
                            use24Hour = use24Hour,
                            waitMinutes = waitMinutes,
                            movementGuard = movementGuard,
                            tapsLocked = tapsLocked,
                        )
                    }
                }
            }
        }
    }

    // The row's snooze button gets a dropdown anchored to itself; this dialog is
    // for the reminder notification's "Other…" action, which arrives with no row
    // on screen to hang a dropdown off.
    viewModel.waitPickerTask?.let { task ->
        WaitOptionsDialog(
            title = task.title,
            waitMinutes = waitMinutes,
            onDismiss = { viewModel.waitPickerTask = null },
            onSnooze = { minutes ->
                viewModel.waitPickerTask = null
                viewModel.snoozeTask(task.id, minutes)
            },
            onPickDuration = {
                viewModel.waitPickerTask = null
                viewModel.durationWaitTask = task
            },
            onPickDateTime = {
                viewModel.waitPickerTask = null
                viewModel.exactWaitTask = task
            },
        )
    }

    if (pausePickerOpen) {
        DateTimePickerFlow(
            initialMillis = null,
            onDismiss = { pausePickerOpen = false },
            onPicked = { atMillis ->
                pausePickerOpen = false
                viewModel.pauseNotificationsUntil(atMillis)
            },
        )
    }

    viewModel.durationWaitTask?.let { task ->
        WaitDurationDialog(
            title = task.title,
            nowMillis = nowMillis,
            use24Hour = use24Hour,
            onDismiss = { viewModel.durationWaitTask = null },
            onConfirm = { durationMillis ->
                viewModel.durationWaitTask = null
                viewModel.snoozeFor(task.id, durationMillis)
            },
        )
    }

    viewModel.exactWaitTask?.let { task ->
        DateTimePickerFlow(
            initialMillis = null,
            onDismiss = { viewModel.exactWaitTask = null },
            onPicked = { atMillis ->
                viewModel.exactWaitTask = null
                viewModel.snoozeUntil(task.id, atMillis)
            },
        )
    }

    // Closing a task the user actually finished earlier. The window is the task's
    // own lifetime: it can't have been done before it was created, nor later than
    // right now.
    viewModel.donePreviouslyTask?.let { task ->
        DateTimePickerFlow(
            initialMillis = null,
            onDismiss = { viewModel.donePreviouslyTask = null },
            onPicked = { atMillis ->
                viewModel.donePreviouslyTask = null
                viewModel.completeTask(task.id, atMillis)
            },
            minMillis = task.createdAtMillis,
            maxMillis = nowMillis,
        )
    }

    // Marking several things done at one earlier moment: the moment first, then
    // what was done at it. Days run up to today; a time later today is clamped
    // to now by the repository, like a single backdated completion.
    if (viewModel.doneEarlierPicking) {
        DateTimePickerFlow(
            initialMillis = viewModel.doneEarlierAtMillis ?: nowMillis,
            onDismiss = { viewModel.doneEarlierPicking = false },
            onPicked = { atMillis -> viewModel.pickDoneEarlierAt(atMillis) },
            maxMillis = nowMillis,
        )
    } else {
        val doneEarlierAt = viewModel.doneEarlierAtMillis
        val candidates = viewModel.doneEarlierCandidates
        if (doneEarlierAt != null && candidates != null) {
            DoneEarlierDialog(
                atMillis = doneEarlierAt,
                candidates = candidates,
                use24Hour = use24Hour,
                onChangeMoment = { viewModel.doneEarlierPicking = true },
                onDismiss = { viewModel.closeDoneEarlier() },
                onConfirm = { openIds, completedIds -> viewModel.markDoneEarlier(openIds, completedIds) },
            )
        }
    }

    viewModel.editingTask?.let { task ->
        EditScheduleDialog(
            task = task,
            use24Hour = use24Hour,
            onDismiss = { viewModel.editingTask = null },
            onSave = { firstWarningAtMillis, repeatIntervalMinutes, recurrence ->
                viewModel.saveSchedule(task.id, firstWarningAtMillis, repeatIntervalMinutes, recurrence)
            },
        )
    }
}

/**
 * Silences every reminder for a while. Nothing is lost: whatever would have
 * nagged during the pause is held and arrives once it ends. [pauseUntilMillis]
 * is null when notifications are live.
 */
@Composable
private fun PauseMenuButton(
    pauseUntilMillis: Long?,
    use24Hour: Boolean,
    onPause: (Int) -> Unit,
    onPickDateTime: () -> Unit,
    onResume: () -> Unit,
) {
    val s = LocalStrings.current
    var menuExpanded by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { menuExpanded = true }) {
            Icon(
                if (pauseUntilMillis != null) Icons.Filled.NotificationsOff else Icons.Filled.Notifications,
                contentDescription = if (pauseUntilMillis != null) s.remindersPaused else s.pauseReminders,
            )
        }
        // Anchored to the button, like the row's snooze menu.
        DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
            if (pauseUntilMillis != null) {
                Text(
                    s.pausedUntil(formatDateTime(pauseUntilMillis, use24Hour, s)),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                )
                DropdownMenuItem(
                    text = { Text(s.resumeNow) },
                    leadingIcon = { Icon(Icons.Filled.Notifications, contentDescription = null) },
                    onClick = {
                        menuExpanded = false
                        onResume()
                    },
                )
                HorizontalDivider()
            }
            PAUSE_OPTIONS_MINUTES.forEach { minutes ->
                DropdownMenuItem(
                    text = { Text(s.pauseFor(formatDuration(minutes, s))) },
                    leadingIcon = { Icon(Icons.Filled.NotificationsOff, contentDescription = null) },
                    onClick = {
                        menuExpanded = false
                        onPause(minutes)
                    },
                )
            }
            HorizontalDivider()
            DropdownMenuItem(
                text = { Text(s.pauseUntilDateTime) },
                leadingIcon = { Icon(Icons.Filled.Schedule, contentDescription = null) },
                onClick = {
                    menuExpanded = false
                    onPickDateTime()
                },
            )
        }
    }
}

@Composable
private fun QuickAdd(viewModel: AppViewModel, use24Hour: Boolean) {
    val s = LocalStrings.current
    var showDateTimePicker by remember { mutableStateOf(false) }
    var showRecurrencePicker by remember { mutableStateOf(false) }
    // A repeating task needs a start time; route through the picker first.
    var pendingAddTitle by remember { mutableStateOf<String?>(null) }
    val firstWarning = viewModel.quickAddFirstWarningAtMillis
    val recurrence = viewModel.quickAddRecurrence

    fun addOrPickTime(title: String) {
        if (viewModel.quickAddRecurrence != null && viewModel.quickAddFirstWarningAtMillis == null) {
            pendingAddTitle = title
            showDateTimePicker = true
        } else {
            viewModel.addTask(title)
        }
    }

    Column {
        OutlinedTextField(
            value = viewModel.quickAddText,
            onValueChange = { viewModel.quickAddText = it },
            placeholder = { Text(s.quickAddPlaceholder) },
            singleLine = true,
            leadingIcon = {
                IconButton(onClick = { showDateTimePicker = true }) {
                    Icon(
                        Icons.Filled.Schedule,
                        contentDescription = s.setFirstReminderTime,
                        tint = if (firstWarning != null) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            LocalContentColor.current
                        },
                    )
                }
            },
            trailingIcon = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { showRecurrencePicker = true }) {
                        Icon(
                            Icons.Filled.Repeat,
                            contentDescription = s.setRecurrence,
                            tint = if (recurrence != null) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                LocalContentColor.current
                            },
                        )
                    }
                    FilledTonalIconButton(
                        onClick = { addOrPickTime(viewModel.quickAddText) },
                        enabled = viewModel.quickAddText.isNotBlank() && !viewModel.busy,
                    ) {
                        Icon(Icons.Filled.Add, contentDescription = s.addTask)
                    }
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp),
        )

        Row {
            if (firstWarning != null) {
                AssistChip(
                    onClick = { showDateTimePicker = true },
                    label = { Text(s.firstNag(formatDateTime(firstWarning, use24Hour, s))) },
                    leadingIcon = { Icon(Icons.Filled.Schedule, contentDescription = null) },
                    trailingIcon = {
                        Icon(
                            Icons.Filled.Close,
                            contentDescription = s.clearFirstReminderTime,
                            modifier = Modifier.clickable { viewModel.quickAddFirstWarningAtMillis = null },
                        )
                    },
                    modifier = Modifier.padding(top = 4.dp, end = 8.dp),
                )
            }
            if (recurrence != null) {
                AssistChip(
                    onClick = { showRecurrencePicker = true },
                    label = { Text(recurrenceLabel(recurrence, s)) },
                    leadingIcon = { Icon(Icons.Filled.Repeat, contentDescription = null) },
                    trailingIcon = {
                        Icon(
                            Icons.Filled.Close,
                            contentDescription = s.clearRecurrence,
                            modifier = Modifier.clickable { viewModel.quickAddRecurrence = null },
                        )
                    },
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }

        if (viewModel.suggestions.isNotEmpty()) {
            Card(modifier = Modifier.fillMaxWidth().padding(top = 4.dp)) {
                Column {
                    viewModel.suggestions.forEach { suggestion ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { addOrPickTime(suggestion) }
                                // The remove button's 48.dp touch target sets the
                                // row height, so the row itself barely pads.
                                .padding(start = 16.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
                        ) {
                            Icon(
                                Icons.Filled.History,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Text(
                                suggestion,
                                style = MaterialTheme.typography.bodyLarge,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f).padding(start = 12.dp),
                            )
                            IconButton(onClick = { viewModel.dismissSuggestion(suggestion) }) {
                                Icon(
                                    Icons.Filled.Close,
                                    contentDescription = s.removeSuggestion(suggestion),
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    if (showDateTimePicker) {
        DateTimePickerFlow(
            initialMillis = firstWarning,
            onDismiss = {
                showDateTimePicker = false
                pendingAddTitle = null
            },
            onPicked = { millis ->
                viewModel.quickAddFirstWarningAtMillis = millis
                showDateTimePicker = false
                pendingAddTitle?.let { title ->
                    pendingAddTitle = null
                    viewModel.addTask(title)
                }
            },
        )
    }

    if (showRecurrencePicker) {
        RecurrencePickerDialog(
            initial = recurrence,
            onDismiss = { showRecurrencePicker = false },
            onConfirm = {
                viewModel.quickAddRecurrence = it
                showRecurrencePicker = false
            },
        )
    }
}

/**
 * Every configured wait plus escape hatches to a typed duration and to an exact
 * date and time. All defer the task locally without touching its real schedule. The anchorless
 * counterpart of the dropdown on a task row's snooze button.
 */
@Composable
private fun WaitOptionsDialog(
    title: String,
    waitMinutes: List<Int>,
    onDismiss: () -> Unit,
    onSnooze: (Int) -> Unit,
    onPickDuration: () -> Unit,
    onPickDateTime: () -> Unit,
) {
    val s = LocalStrings.current
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                title,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        },
        text = {
            Column {
                waitMinutes.forEach { minutes ->
                    ListItem(
                        headlineContent = { Text(s.waitFor(formatDuration(minutes, s))) },
                        leadingContent = { Icon(Icons.Filled.Snooze, contentDescription = null) },
                        modifier = Modifier.clickable { onSnooze(minutes) },
                    )
                }
                HorizontalDivider()
                ListItem(
                    headlineContent = { Text(s.waitForDuration) },
                    leadingContent = { Icon(Icons.Filled.Timer, contentDescription = null) },
                    modifier = Modifier.clickable(onClick = onPickDuration),
                )
                ListItem(
                    headlineContent = { Text(s.pickDateTime) },
                    leadingContent = { Icon(Icons.Filled.Schedule, contentDescription = null) },
                    modifier = Modifier.clickable(onClick = onPickDateTime),
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text(s.cancel) }
        },
    )
}

/**
 * Snoozes for a typed wait such as "27m" or "15m 45s" — the "in a while" the
 * configured waits don't cover, without making the user work out the clock time
 * themselves. The landing moment is previewed so a typo shows before it commits.
 */
@Composable
private fun WaitDurationDialog(
    title: String,
    nowMillis: Long,
    use24Hour: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (Long) -> Unit,
) {
    val s = LocalStrings.current
    var text by remember { mutableStateOf("") }
    val durationMillis = parseWaitDuration(text)
    val focusRequester = remember { FocusRequester() }
    LaunchedEffect(Unit) { focusRequester.requestFocus() }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                title,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        },
        text = {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                label = { Text(s.waitForDuration) },
                placeholder = { Text(s.waitDurationHint) },
                singleLine = true,
                isError = text.isNotBlank() && durationMillis == null,
                supportingText = {
                    when {
                        durationMillis != null -> Text(
                            s.nextNagAt(formatDateTime(nowMillis + durationMillis, use24Hour, s)),
                        )
                        text.isNotBlank() -> Text(s.waitDurationInvalid)
                    }
                },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { durationMillis?.let(onConfirm) }),
                modifier = Modifier.fillMaxWidth().focusRequester(focusRequester),
            )
        },
        confirmButton = {
            TextButton(
                onClick = { durationMillis?.let(onConfirm) },
                enabled = durationMillis != null,
            ) { Text(s.snooze) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(s.cancel) }
        },
    )
}

/**
 * The two-step date-then-time picker. The DatePicker returns UTC midnight for
 * the chosen calendar day; the result combines that date with the picked local
 * time in the device zone.
 *
 * [minMillis] and [maxMillis] bound the selectable days — inclusive, and only to
 * day precision, so a caller that also cares about the time of day has to clamp
 * the result itself.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DateTimePickerFlow(
    initialMillis: Long?,
    onDismiss: () -> Unit,
    onPicked: (Long) -> Unit,
    minMillis: Long? = null,
    maxMillis: Long? = null,
) {
    val s = LocalStrings.current
    var pickedDateMillis by remember { mutableStateOf<Long?>(null) }

    if (pickedDateMillis == null) {
        // The picker speaks UTC midnight, so the bounds have to be restated as
        // the UTC midnight of the local day they fall on.
        val minDay = minMillis?.let(::utcStartOfLocalDay)
        val maxDay = maxMillis?.let(::utcStartOfLocalDay)
        val dateState = rememberDatePickerState(
            initialSelectedDateMillis = initialMillis ?: System.currentTimeMillis(),
            yearRange = IntRange(
                minMillis?.let(::localYearOf) ?: DatePickerDefaults.YearRange.first,
                maxMillis?.let(::localYearOf) ?: DatePickerDefaults.YearRange.last,
            ),
            selectableDates = remember(minDay, maxDay) {
                object : SelectableDates {
                    override fun isSelectableDate(utcTimeMillis: Long): Boolean =
                        (minDay == null || utcTimeMillis >= minDay) &&
                            (maxDay == null || utcTimeMillis <= maxDay)

                    override fun isSelectableYear(year: Int): Boolean =
                        (minMillis == null || year >= localYearOf(minMillis)) &&
                            (maxMillis == null || year <= localYearOf(maxMillis))
                }
            },
        )
        DatePickerDialog(
            onDismissRequest = onDismiss,
            confirmButton = {
                TextButton(
                    enabled = dateState.selectedDateMillis != null,
                    onClick = { pickedDateMillis = dateState.selectedDateMillis },
                ) { Text(s.next) }
            },
            dismissButton = {
                TextButton(onClick = onDismiss) { Text(s.cancel) }
            },
        ) {
            DatePicker(state = dateState)
        }
    } else {
        val initial = initialMillis?.let { Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault()) }
        TimePickerDialog(
            initialHour = initial?.hour ?: 9,
            initialMinute = initial?.minute ?: 0,
            onDismiss = onDismiss,
            onPicked = { hour, minute ->
                val date = Instant.ofEpochMilli(pickedDateMillis!!)
                    .atZone(ZoneOffset.UTC)
                    .toLocalDate()
                onPicked(
                    date.atTime(hour, minute)
                        .atZone(ZoneId.systemDefault())
                        .toInstant()
                        .toEpochMilli(),
                )
            },
        )
    }
}

/**
 * One section's worth of rows. The three sections differ only in their header
 * and in whether the row reads as scheduled, so they share this.
 */
private fun LazyListScope.taskRows(
    tasks: List<OpenTaskEntity>,
    scheduled: Boolean,
    viewModel: AppViewModel,
    nowMillis: Long,
    pauseUntilMillis: Long?,
    quietHours: List<QuietRange>,
    use24Hour: Boolean,
    waitMinutes: List<Int>,
    movementGuard: RowMovementGuard,
    tapsLocked: Boolean,
) {
    items(tasks, key = { it.id }) { task ->
        Column {
            TaskRow(
                task = task,
                scheduled = scheduled,
                nowMillis = nowMillis,
                pauseUntilMillis = pauseUntilMillis,
                quietHours = quietHours,
                use24Hour = use24Hour,
                waitMinutes = waitMinutes,
                canAct = movementGuard::allowsTap,
                tapsLocked = tapsLocked,
                onDone = { viewModel.completeTask(task.id) },
                onDonePreviously = { viewModel.donePreviouslyTask = task },
                onCancel = { viewModel.cancelTask(task.id) },
                onSnooze = { minutes -> viewModel.snoozeTask(task.id, minutes) },
                onPickDuration = { viewModel.durationWaitTask = task },
                onPickDateTime = { viewModel.exactWaitTask = task },
                // Only a task that has not started yet can be brought forward.
                onAdvance = { if (scheduled) viewModel.advanceTask(task.id) },
                onEdit = { viewModel.beginEditSchedule(task) },
            )
            HorizontalDivider()
        }
    }
}

@Composable
internal fun TaskSectionHeader(label: String) {
    Text(
        label,
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 16.dp, bottom = 4.dp),
    )
}

/**
 * The instant's local calendar day, restated as UTC midnight — the currency the
 * M3 DatePicker deals in.
 */
private fun utcStartOfLocalDay(epochMillis: Long): Long =
    Instant.ofEpochMilli(epochMillis).atZone(ZoneId.systemDefault()).toLocalDate()
        .atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

private fun localYearOf(epochMillis: Long): Int =
    Instant.ofEpochMilli(epochMillis).atZone(ZoneId.systemDefault()).year

private val timeFormatter12: DateTimeFormatter = DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH)
private val timeFormatter24: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

/**
 * "Jul 17, 3:05 PM" or "17 de jul, 15:05". Month names come from [Strings]
 * rather than the locale's own, so the web client, which spells them the same
 * way, reads identically.
 */
internal fun formatDateTime(epochMillis: Long, use24Hour: Boolean, strings: Strings = Strings.English): String {
    val at = Instant.ofEpochMilli(epochMillis).atZone(ZoneId.systemDefault())
    val time = at.format(if (use24Hour) timeFormatter24 else timeFormatter12)
    return "${strings.dayAndMonth(at.dayOfMonth, at.monthValue)}, $time"
}

/** "Friday, Sep 18" — how a day names itself once it isn't today. */
internal fun formatDayTitle(date: java.time.LocalDate, strings: Strings = Strings.English): String {
    val weekday = date.dayOfWeek.getDisplayName(TextStyle.FULL, strings.locale)
    return "$weekday, ${strings.dayAndMonth(date.dayOfMonth, date.monthValue)}"
}

/** "3:05 PM" or "15:05" — the same instant as [formatDateTime], without the date. */
internal fun formatTimeOfDay(
    epochMillis: Long,
    use24Hour: Boolean,
    zone: ZoneId = ZoneId.systemDefault(),
): String =
    Instant.ofEpochMilli(epochMillis).atZone(zone)
        .format(if (use24Hour) timeFormatter24 else timeFormatter12)

@Composable
private fun TaskRow(
    task: OpenTaskEntity,
    scheduled: Boolean,
    nowMillis: Long,
    pauseUntilMillis: Long?,
    quietHours: List<QuietRange>,
    use24Hour: Boolean,
    onDone: () -> Unit,
    onDonePreviously: () -> Unit,
    onCancel: () -> Unit,
    waitMinutes: List<Int>,
    canAct: () -> Boolean,
    tapsLocked: Boolean,
    onSnooze: (Int) -> Unit,
    onPickDuration: () -> Unit,
    onPickDateTime: () -> Unit,
    onAdvance: () -> Unit,
    onEdit: () -> Unit,
) {
    // While [tapsLocked] the buttons fade, so a tap the guard swallows looks like
    // it never landed rather than like it worked.
    // Only the buttons fade: dimming the whole row would flash the task text on
    // every reorder, even when nobody is tapping.
    val buttonAlpha by animateFloatAsState(
        targetValue = if (tapsLocked) ROW_LOCKED_BUTTON_ALPHA else 1f,
        animationSpec = tween(ROW_LOCK_FADE_MILLIS),
        label = "rowButtonAlpha",
    )
    val buttonFade = Modifier.graphicsLayer { alpha = buttonAlpha }
    val s = LocalStrings.current
    // Everything on the row's face is gated by [canAct], asked at the moment of
    // the tap: just after a reorder, the task under the finger may not be the
    // one the user aimed at. The menus aren't — they already belong to a task.
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clickable { if (canAct()) onEdit() }
            .padding(vertical = 8.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                task.title,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            val schedule = if (scheduled) {
                s.starts(formatDateTime(task.firstWarningAtMillis ?: task.nextFireAtMillis, use24Hour, s))
            } else {
                // The effective time, not the intended one: while paused or
                // inside the quiet hours the task still holds the fire time it
                // wants, but promising a nag that will be held back is a lie.
                val nextNag = deferPastQuietHours(
                    deferPastPause(task.nextFireAtMillis, pauseUntilMillis),
                    quietHours,
                )
                s.nextNag(relativeFuture(nextNag, nowMillis, s), task.repeatIntervalMinutes)
            }
            Text(
                schedule,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            task.recurrence()?.let { recurrence ->
                Text(
                    recurrenceLabel(recurrence, s),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }

        // Snoozing a task that hasn't started nagging is meaningless.
        if (!scheduled) {
            var menuExpanded by remember { mutableStateOf(false) }
            Box {
                IconButton(onClick = { if (canAct()) menuExpanded = true }, modifier = buttonFade) {
                    Icon(Icons.Filled.Snooze, contentDescription = s.snooze)
                }
                // Anchored to the button so the options appear where the user is
                // already looking.
                DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                    waitMinutes.forEach { minutes ->
                        DropdownMenuItem(
                            text = { Text(s.waitFor(formatDuration(minutes, s))) },
                            leadingIcon = { Icon(Icons.Filled.Snooze, contentDescription = null) },
                            onClick = {
                                menuExpanded = false
                                onSnooze(minutes)
                            },
                        )
                    }
                    HorizontalDivider()
                    DropdownMenuItem(
                        text = { Text(s.waitForDuration) },
                        leadingIcon = { Icon(Icons.Filled.Timer, contentDescription = null) },
                        onClick = {
                            menuExpanded = false
                            onPickDuration()
                        },
                    )
                    DropdownMenuItem(
                        text = { Text(s.pickDateTime) },
                        leadingIcon = { Icon(Icons.Filled.Schedule, contentDescription = null) },
                        onClick = {
                            menuExpanded = false
                            onPickDateTime()
                        },
                    )
                }
            }
        } else {
            // The snooze slot, mirrored: a scheduled task can't be pushed later
            // from here, but it can be pulled to now.
            IconButton(onClick = { if (canAct()) onAdvance() }, modifier = buttonFade) {
                Icon(Icons.Filled.PlayArrow, contentDescription = s.startNaggingNow)
            }
        }

        DoneButton(
            canAct = canAct,
            modifier = buttonFade,
            onDone = onDone,
            onDonePreviously = onDonePreviously,
            onCancel = onCancel,
        )
    }
}

/**
 * Tap closes the task as done now; long-press offers the other ways out —
 * crediting it at an earlier moment, or cancelling, which closes it without
 * crediting it at all. Hand-rolled rather than a FilledTonalIconButton because
 * the M3 icon buttons take no onLongClick; the size and colours mirror the tonal
 * button so the row looks unchanged.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun DoneButton(
    canAct: () -> Boolean,
    onDone: () -> Unit,
    onDonePreviously: () -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val s = LocalStrings.current
    var menuOpen by remember { mutableStateOf(false) }

    Box {
        Box(
            modifier = modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.secondaryContainer)
                .combinedClickable(
                    role = Role.Button,
                    onClickLabel = s.markDone,
                    onLongClickLabel = s.otherWaysToClose,
                    onClick = { if (canAct()) onDone() },
                    onLongClick = { if (canAct()) menuOpen = true },
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.Check,
                contentDescription = s.markDone,
                tint = MaterialTheme.colorScheme.onSecondaryContainer,
            )
        }
        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
            DropdownMenuItem(
                text = { Text(s.donePreviously) },
                leadingIcon = { Icon(Icons.Filled.History, contentDescription = null) },
                onClick = {
                    menuOpen = false
                    onDonePreviously()
                },
            )
            DropdownMenuItem(
                text = { Text(s.cancelTask) },
                leadingIcon = { Icon(Icons.Filled.Close, contentDescription = null) },
                onClick = {
                    menuOpen = false
                    onCancel()
                },
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RecurrencePickerDialog(
    initial: Recurrence?,
    onDismiss: () -> Unit,
    onConfirm: (Recurrence?) -> Unit,
) {
    val s = LocalStrings.current
    var unit by remember { mutableStateOf(initial?.unit) }
    var everyNText by remember { mutableStateOf((initial?.everyN ?: 1).toString()) }
    var daysOfWeek by remember {
        mutableStateOf(initial?.takeIf { it.unit == RecurUnit.WEEKS }?.daysOfWeek ?: 0)
    }
    val everyN = everyNText.toIntOrNull()
    val valid = unit == null ||
        (everyN != null && everyN >= 1 && (unit != RecurUnit.WEEKS || daysOfWeek in 1..127))

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(s.repeatTitle) },
        confirmButton = {
            TextButton(
                enabled = valid,
                onClick = {
                    onConfirm(
                        unit?.let { Recurrence(everyN!!, it, if (it == RecurUnit.WEEKS) daysOfWeek else 0) },
                    )
                },
            ) { Text(s.setAction) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(s.cancel) }
        },
        text = {
            Column {
                Row {
                    FilterChip(
                        selected = unit == null,
                        onClick = { unit = null },
                        label = { Text(s.repeatNone) },
                        modifier = Modifier.padding(end = 8.dp),
                    )
                    FilterChip(
                        selected = unit == RecurUnit.DAYS,
                        onClick = { unit = RecurUnit.DAYS },
                        label = { Text(s.repeatDaily) },
                        modifier = Modifier.padding(end = 8.dp),
                    )
                    FilterChip(
                        selected = unit == RecurUnit.WEEKS,
                        onClick = {
                            unit = RecurUnit.WEEKS
                            if (daysOfWeek == 0) daysOfWeek = defaultWeekdayBit()
                        },
                        label = { Text(s.repeatWeekly) },
                    )
                }
                if (unit != null) {
                    OutlinedTextField(
                        value = everyNText,
                        onValueChange = { everyNText = it },
                        label = { Text(if (unit == RecurUnit.DAYS) s.everyNDaysField else s.everyNWeeksField) },
                        singleLine = true,
                        isError = everyN == null || everyN < 1,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                }
                if (unit == RecurUnit.WEEKS) {
                    FlowRow(modifier = Modifier.padding(top = 12.dp)) {
                        DayOfWeek.entries.forEach { day ->
                            val bit = 1 shl day.ordinal
                            FilterChip(
                                selected = daysOfWeek and bit != 0,
                                onClick = { daysOfWeek = daysOfWeek xor bit },
                                label = { Text(day.getDisplayName(TextStyle.SHORT, s.locale)) },
                                modifier = Modifier.padding(end = 6.dp),
                            )
                        }
                    }
                }
            }
        },
    )
}

@Composable
private fun EditScheduleDialog(
    task: OpenTaskEntity,
    use24Hour: Boolean,
    onDismiss: () -> Unit,
    onSave: (firstWarningAtMillis: Long?, repeatIntervalMinutes: Int, recurrence: Recurrence?) -> Unit,
) {
    val s = LocalStrings.current
    var startMillis by remember { mutableStateOf(task.firstWarningAtMillis) }
    var recurrence by remember { mutableStateOf(task.recurrence()) }
    var intervalText by remember { mutableStateOf(task.repeatIntervalMinutes.toString()) }
    var showDateTimePicker by remember { mutableStateOf(false) }
    var showRecurrencePicker by remember { mutableStateOf(false) }
    val interval = intervalText.toIntOrNull()
    val valid = interval != null && interval >= 1 && (recurrence == null || startMillis != null)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(task.title, maxLines = 2, overflow = TextOverflow.Ellipsis) },
        confirmButton = {
            TextButton(
                enabled = valid,
                onClick = { onSave(startMillis, interval!!, recurrence) },
            ) { Text(s.save) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(s.cancel) }
        },
        text = {
            Column {
                AssistChip(
                    onClick = { showDateTimePicker = true },
                    label = {
                        Text(startMillis?.let { s.startsCapitalised(formatDateTime(it, use24Hour, s)) } ?: s.setStartTime)
                    },
                    leadingIcon = { Icon(Icons.Filled.Schedule, contentDescription = null) },
                    trailingIcon = {
                        if (startMillis != null) {
                            Icon(
                                Icons.Filled.Close,
                                contentDescription = s.clearStartTime,
                                modifier = Modifier.clickable {
                                    startMillis = null
                                    recurrence = null
                                },
                            )
                        }
                    },
                )
                AssistChip(
                    onClick = { showRecurrencePicker = true },
                    label = { Text(recurrence?.let { recurrenceLabel(it, s) } ?: s.doesNotRepeat) },
                    leadingIcon = { Icon(Icons.Filled.Repeat, contentDescription = null) },
                    trailingIcon = {
                        if (recurrence != null) {
                            Icon(
                                Icons.Filled.Close,
                                contentDescription = s.clearRecurrence,
                                modifier = Modifier.clickable { recurrence = null },
                            )
                        }
                    },
                    modifier = Modifier.padding(top = 4.dp),
                )
                OutlinedTextField(
                    value = intervalText,
                    onValueChange = { intervalText = it },
                    label = { Text(s.nagEveryNMinutes) },
                    singleLine = true,
                    isError = interval == null || interval < 1,
                    modifier = Modifier.padding(top = 12.dp),
                )
                if (recurrence != null && startMillis == null) {
                    Text(
                        s.repeatingNeedsStart,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
            }
        },
    )

    if (showDateTimePicker) {
        DateTimePickerFlow(
            initialMillis = startMillis,
            onDismiss = { showDateTimePicker = false },
            onPicked = {
                startMillis = it
                showDateTimePicker = false
            },
        )
    }

    if (showRecurrencePicker) {
        RecurrencePickerDialog(
            initial = recurrence,
            onDismiss = { showRecurrencePicker = false },
            onConfirm = {
                recurrence = it
                showRecurrencePicker = false
            },
        )
    }
}

/** "every day", "every 2 weeks · Mon, Wed, Fri" */
internal fun recurrenceLabel(recurrence: Recurrence, strings: Strings = Strings.English): String {
    val cadence = when (recurrence.unit) {
        RecurUnit.DAYS -> if (recurrence.everyN == 1) strings.everyDay else strings.everyNDays(recurrence.everyN)
        RecurUnit.WEEKS -> if (recurrence.everyN == 1) strings.everyWeek else strings.everyNWeeks(recurrence.everyN)
    }
    if (recurrence.unit != RecurUnit.WEEKS) return cadence
    val days = DayOfWeek.entries
        .filter { recurrence.daysOfWeek and (1 shl it.ordinal) != 0 }
        .joinToString(", ") { it.getDisplayName(TextStyle.SHORT, strings.locale) }
    return "$cadence · $days"
}

/** Bit for today's weekday, the natural starting selection. */
private fun defaultWeekdayBit(): Int =
    1 shl java.time.LocalDate.now().dayOfWeek.ordinal

private fun relativeFuture(epochMillis: Long, nowMillis: Long, strings: Strings): String {
    val remaining = epochMillis - nowMillis
    val minutes = TimeUnit.MILLISECONDS.toMinutes(remaining)
    return when {
        minutes < 1 -> strings.relativeNow
        minutes < 60 -> strings.inMinutes(minutes)
        minutes < 60 * 24 -> strings.inHours(minutes / 60)
        else -> strings.inDays(minutes / (60 * 24))
    }
}

/** "45m", "4h", "1h 30m" — also used for the notification's Wait button. */
internal fun formatDuration(minutes: Int, strings: Strings = Strings.English): String = strings.duration(minutes)
