package com.relentlessbadger.app.ui

import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.text.format.DateFormat
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Snooze
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.DatePicker
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
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.relentlessbadger.app.data.DEFAULT_WAIT_MINUTES
import com.relentlessbadger.app.data.Recurrence
import com.relentlessbadger.app.data.RecurUnit
import com.relentlessbadger.app.data.recurrence
import com.relentlessbadger.app.db.OpenTaskEntity
import kotlinx.coroutines.delay
import java.time.DayOfWeek
import java.time.Instant
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
    val use24Hour = DateFormat.is24HourFormat(context)
    val waitMinutes = session?.waitMinutes ?: DEFAULT_WAIT_MINUTES

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
                message = "Removed \"$title\" from suggestions",
                actionLabel = "Undo",
            )
            if (result == SnackbarResult.ActionPerformed) {
                viewModel.undoDismissSuggestion(title)
            }
            viewModel.dismissedSuggestion = null
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("RelentlessBadger") },
                actions = {
                    IconButton(onClick = { viewModel.refresh(interactive = true) }) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Sync")
                    }
                    IconButton(onClick = onOpenSettings) {
                        Icon(Icons.Filled.Settings, contentDescription = "Settings")
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
                            "Exact alarms are disabled, so reminders may arrive late.",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        TextButton(onClick = {
                            context.startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM))
                        }) {
                            Text("Allow exact alarms")
                        }
                    }
                }
            }

            QuickAdd(viewModel, use24Hour)

            Spacer(Modifier.height(8.dp))

            if (tasks.isEmpty()) {
                Column(
                    modifier = Modifier.fillMaxSize(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Spacer(Modifier.height(64.dp))
                    Text("Nothing pending 🎉", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Add something above and the badger starts crowing.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            } else {
                // Ticks so the "next nag" countdowns stay current and scheduled
                // tasks move into the active section when their start time
                // passes without any data change.
                val nowMillis by produceState(System.currentTimeMillis()) {
                    while (true) {
                        delay(15_000)
                        value = System.currentTimeMillis()
                    }
                }
                // Keyed on the start time, not nextFire, so a snoozed task
                // doesn't jump into "Scheduled".
                val (scheduled, active) = tasks.partition {
                    (it.firstWarningAtMillis ?: 0L) > nowMillis
                }
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(active, key = { it.id }) { task ->
                        TaskRow(
                            task = task,
                            scheduled = false,
                            nowMillis = nowMillis,
                            use24Hour = use24Hour,
                            waitMinutes = waitMinutes,
                            onDone = { viewModel.completeTask(task.id) },
                            onCancel = { viewModel.cancelTask(task.id) },
                            onSnooze = { minutes -> viewModel.snoozeTask(task.id, minutes) },
                            onPickDateTime = { viewModel.exactWaitTask = task },
                            onEdit = { viewModel.beginEditSchedule(task) },
                        )
                        HorizontalDivider()
                    }
                    if (scheduled.isNotEmpty()) {
                        item(key = "scheduled-header") {
                            Text(
                                "Scheduled",
                                style = MaterialTheme.typography.titleSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(top = 16.dp, bottom = 4.dp),
                            )
                        }
                        items(scheduled, key = { it.id }) { task ->
                            TaskRow(
                                task = task,
                                scheduled = true,
                                nowMillis = nowMillis,
                                use24Hour = use24Hour,
                                waitMinutes = waitMinutes,
                                onDone = { viewModel.completeTask(task.id) },
                                onCancel = { viewModel.cancelTask(task.id) },
                                onSnooze = { minutes -> viewModel.snoozeTask(task.id, minutes) },
                                onPickDateTime = { viewModel.exactWaitTask = task },
                                onEdit = { viewModel.beginEditSchedule(task) },
                            )
                            HorizontalDivider()
                        }
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
            onPickDateTime = {
                viewModel.waitPickerTask = null
                viewModel.exactWaitTask = task
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

@Composable
private fun QuickAdd(viewModel: AppViewModel, use24Hour: Boolean) {
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
            placeholder = { Text("What needs doing right away?") },
            singleLine = true,
            leadingIcon = {
                IconButton(onClick = { showDateTimePicker = true }) {
                    Icon(
                        Icons.Filled.Schedule,
                        contentDescription = "Set first reminder time",
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
                            contentDescription = "Set recurrence",
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
                        Icon(Icons.Filled.Add, contentDescription = "Add task")
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
                    label = { Text("First nag ${formatDateTime(firstWarning, use24Hour)}") },
                    leadingIcon = { Icon(Icons.Filled.Schedule, contentDescription = null) },
                    trailingIcon = {
                        Icon(
                            Icons.Filled.Close,
                            contentDescription = "Clear first reminder time",
                            modifier = Modifier.clickable { viewModel.quickAddFirstWarningAtMillis = null },
                        )
                    },
                    modifier = Modifier.padding(top = 4.dp, end = 8.dp),
                )
            }
            if (recurrence != null) {
                AssistChip(
                    onClick = { showRecurrencePicker = true },
                    label = { Text(recurrenceLabel(recurrence)) },
                    leadingIcon = { Icon(Icons.Filled.Repeat, contentDescription = null) },
                    trailingIcon = {
                        Icon(
                            Icons.Filled.Close,
                            contentDescription = "Clear recurrence",
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
                                    contentDescription = "Remove \"$suggestion\" from suggestions",
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
 * Every configured wait plus an escape hatch to an exact date and time. Both
 * defer the task locally without touching its real schedule. The anchorless
 * counterpart of the dropdown on a task row's snooze button.
 */
@Composable
private fun WaitOptionsDialog(
    title: String,
    waitMinutes: List<Int>,
    onDismiss: () -> Unit,
    onSnooze: (Int) -> Unit,
    onPickDateTime: () -> Unit,
) {
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
                        headlineContent = { Text("Wait ${formatDuration(minutes)}") },
                        leadingContent = { Icon(Icons.Filled.Snooze, contentDescription = null) },
                        modifier = Modifier.clickable { onSnooze(minutes) },
                    )
                }
                HorizontalDivider()
                ListItem(
                    headlineContent = { Text("Pick a date & time…") },
                    leadingContent = { Icon(Icons.Filled.Schedule, contentDescription = null) },
                    modifier = Modifier.clickable(onClick = onPickDateTime),
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

/**
 * The two-step date-then-time picker. The DatePicker returns UTC midnight for
 * the chosen calendar day; the result combines that date with the picked local
 * time in the device zone.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DateTimePickerFlow(
    initialMillis: Long?,
    onDismiss: () -> Unit,
    onPicked: (Long) -> Unit,
) {
    var pickedDateMillis by remember { mutableStateOf<Long?>(null) }

    if (pickedDateMillis == null) {
        val dateState = rememberDatePickerState(
            initialSelectedDateMillis = initialMillis ?: System.currentTimeMillis(),
        )
        DatePickerDialog(
            onDismissRequest = onDismiss,
            confirmButton = {
                TextButton(
                    enabled = dateState.selectedDateMillis != null,
                    onClick = { pickedDateMillis = dateState.selectedDateMillis },
                ) { Text("Next") }
            },
            dismissButton = {
                TextButton(onClick = onDismiss) { Text("Cancel") }
            },
        ) {
            DatePicker(state = dateState)
        }
    } else {
        val initial = initialMillis?.let { Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault()) }
        val timeState = rememberTimePickerState(
            initialHour = initial?.hour ?: 9,
            initialMinute = initial?.minute ?: 0,
        )
        AlertDialog(
            onDismissRequest = onDismiss,
            confirmButton = {
                TextButton(onClick = {
                    val date = Instant.ofEpochMilli(pickedDateMillis!!)
                        .atZone(ZoneOffset.UTC)
                        .toLocalDate()
                    onPicked(
                        date.atTime(timeState.hour, timeState.minute)
                            .atZone(ZoneId.systemDefault())
                            .toInstant()
                            .toEpochMilli(),
                    )
                }) { Text("Set") }
            },
            dismissButton = {
                TextButton(onClick = onDismiss) { Text("Cancel") }
            },
            text = { TimePicker(state = timeState) },
        )
    }
}

private val dateTimeFormatter12: DateTimeFormatter = DateTimeFormatter.ofPattern("MMM d, h:mm a")
private val dateTimeFormatter24: DateTimeFormatter = DateTimeFormatter.ofPattern("MMM d, HH:mm")

internal fun formatDateTime(epochMillis: Long, use24Hour: Boolean): String =
    Instant.ofEpochMilli(epochMillis).atZone(ZoneId.systemDefault())
        .format(if (use24Hour) dateTimeFormatter24 else dateTimeFormatter12)

@Composable
private fun TaskRow(
    task: OpenTaskEntity,
    scheduled: Boolean,
    nowMillis: Long,
    use24Hour: Boolean,
    onDone: () -> Unit,
    onCancel: () -> Unit,
    waitMinutes: List<Int>,
    onSnooze: (Int) -> Unit,
    onPickDateTime: () -> Unit,
    onEdit: () -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onEdit)
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
                "starts ${formatDateTime(task.firstWarningAtMillis ?: task.nextFireAtMillis, use24Hour)}"
            } else {
                "next nag ${relativeFuture(task.nextFireAtMillis, nowMillis)} · every ${task.repeatIntervalMinutes} min"
            }
            Text(
                schedule,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            task.recurrence()?.let { recurrence ->
                Text(
                    recurrenceLabel(recurrence),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }

        // Snoozing a task that hasn't started nagging is meaningless.
        if (!scheduled) {
            var menuExpanded by remember { mutableStateOf(false) }
            Box {
                IconButton(onClick = { menuExpanded = true }) {
                    Icon(Icons.Filled.Snooze, contentDescription = "Snooze")
                }
                // Anchored to the button so the options appear where the user is
                // already looking.
                DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                    waitMinutes.forEach { minutes ->
                        DropdownMenuItem(
                            text = { Text("Wait ${formatDuration(minutes)}") },
                            leadingIcon = { Icon(Icons.Filled.Snooze, contentDescription = null) },
                            onClick = {
                                menuExpanded = false
                                onSnooze(minutes)
                            },
                        )
                    }
                    HorizontalDivider()
                    DropdownMenuItem(
                        text = { Text("Pick a date & time…") },
                        leadingIcon = { Icon(Icons.Filled.Schedule, contentDescription = null) },
                        onClick = {
                            menuExpanded = false
                            onPickDateTime()
                        },
                    )
                }
            }
        }

        DoneButton(onDone = onDone, onCancel = onCancel)
    }
}

/**
 * Tap closes the task as done; long-press offers the secondary way out —
 * cancelling, which closes it without crediting it. Hand-rolled rather than a
 * FilledTonalIconButton because the M3 icon buttons take no onLongClick; the
 * size and colours mirror the tonal button so the row looks unchanged.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun DoneButton(onDone: () -> Unit, onCancel: () -> Unit) {
    var menuOpen by remember { mutableStateOf(false) }

    Box {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.secondaryContainer)
                .combinedClickable(
                    role = Role.Button,
                    onClickLabel = "Mark done",
                    onLongClickLabel = "Other ways to close this task",
                    onClick = onDone,
                    onLongClick = { menuOpen = true },
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.Check,
                contentDescription = "Mark done",
                tint = MaterialTheme.colorScheme.onSecondaryContainer,
            )
        }
        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
            DropdownMenuItem(
                text = { Text("Cancel task") },
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
        title = { Text("Repeat") },
        confirmButton = {
            TextButton(
                enabled = valid,
                onClick = {
                    onConfirm(
                        unit?.let { Recurrence(everyN!!, it, if (it == RecurUnit.WEEKS) daysOfWeek else 0) },
                    )
                },
            ) { Text("Set") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
        text = {
            Column {
                Row {
                    FilterChip(
                        selected = unit == null,
                        onClick = { unit = null },
                        label = { Text("None") },
                        modifier = Modifier.padding(end = 8.dp),
                    )
                    FilterChip(
                        selected = unit == RecurUnit.DAYS,
                        onClick = { unit = RecurUnit.DAYS },
                        label = { Text("Daily") },
                        modifier = Modifier.padding(end = 8.dp),
                    )
                    FilterChip(
                        selected = unit == RecurUnit.WEEKS,
                        onClick = {
                            unit = RecurUnit.WEEKS
                            if (daysOfWeek == 0) daysOfWeek = defaultWeekdayBit()
                        },
                        label = { Text("Weekly") },
                    )
                }
                if (unit != null) {
                    OutlinedTextField(
                        value = everyNText,
                        onValueChange = { everyNText = it },
                        label = { Text(if (unit == RecurUnit.DAYS) "Every N days" else "Every N weeks") },
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
                                label = { Text(day.getDisplayName(TextStyle.SHORT, Locale.getDefault())) },
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
            ) { Text("Save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
        text = {
            Column {
                AssistChip(
                    onClick = { showDateTimePicker = true },
                    label = {
                        Text(startMillis?.let { "Starts ${formatDateTime(it, use24Hour)}" } ?: "Set start time")
                    },
                    leadingIcon = { Icon(Icons.Filled.Schedule, contentDescription = null) },
                    trailingIcon = {
                        if (startMillis != null) {
                            Icon(
                                Icons.Filled.Close,
                                contentDescription = "Clear start time",
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
                    label = { Text(recurrence?.let { recurrenceLabel(it) } ?: "Does not repeat") },
                    leadingIcon = { Icon(Icons.Filled.Repeat, contentDescription = null) },
                    trailingIcon = {
                        if (recurrence != null) {
                            Icon(
                                Icons.Filled.Close,
                                contentDescription = "Clear recurrence",
                                modifier = Modifier.clickable { recurrence = null },
                            )
                        }
                    },
                    modifier = Modifier.padding(top = 4.dp),
                )
                OutlinedTextField(
                    value = intervalText,
                    onValueChange = { intervalText = it },
                    label = { Text("Nag every N minutes") },
                    singleLine = true,
                    isError = interval == null || interval < 1,
                    modifier = Modifier.padding(top = 12.dp),
                )
                if (recurrence != null && startMillis == null) {
                    Text(
                        "A repeating task needs a start time.",
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
private fun recurrenceLabel(recurrence: Recurrence): String {
    val cadence = when (recurrence.unit) {
        RecurUnit.DAYS -> if (recurrence.everyN == 1) "every day" else "every ${recurrence.everyN} days"
        RecurUnit.WEEKS -> if (recurrence.everyN == 1) "every week" else "every ${recurrence.everyN} weeks"
    }
    if (recurrence.unit != RecurUnit.WEEKS) return cadence
    val days = DayOfWeek.entries
        .filter { recurrence.daysOfWeek and (1 shl it.ordinal) != 0 }
        .joinToString(", ") { it.getDisplayName(TextStyle.SHORT, Locale.getDefault()) }
    return "$cadence · $days"
}

/** Bit for today's weekday, the natural starting selection. */
private fun defaultWeekdayBit(): Int =
    1 shl java.time.LocalDate.now().dayOfWeek.ordinal

private fun relativeFuture(epochMillis: Long, nowMillis: Long): String {
    val remaining = epochMillis - nowMillis
    val minutes = TimeUnit.MILLISECONDS.toMinutes(remaining)
    return when {
        minutes < 1 -> "now"
        minutes < 60 -> "in $minutes min"
        minutes < 60 * 24 -> "in ${minutes / 60} h"
        else -> "in ${minutes / (60 * 24)} d"
    }
}

/** "45m", "4h", "1h 30m" — also used for the notification's Wait button. */
internal fun formatDuration(minutes: Int): String = when {
    minutes < 60 -> "${minutes}m"
    minutes % 60 == 0 -> "${minutes / 60}h"
    else -> "${minutes / 60}h ${minutes % 60}m"
}
