package com.relentlessbadger.app.ui

import android.content.Intent
import android.text.format.DateFormat
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.toMutableStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.relentlessbadger.app.data.DEFAULT_QUIET_HOURS
import com.relentlessbadger.app.data.Language
import com.relentlessbadger.app.data.LanguagePreference
import com.relentlessbadger.app.data.deviceLanguageTag
import com.relentlessbadger.app.data.resolveLanguage
import com.relentlessbadger.app.data.MAX_QUIET_RANGES
import com.relentlessbadger.app.data.MAX_WAITS
import com.relentlessbadger.app.data.parseNotificationSound
import com.relentlessbadger.app.data.parseQuietRange
import com.relentlessbadger.app.data.toStorageString
import com.relentlessbadger.app.data.Session
import com.relentlessbadger.app.data.SoundStream
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    viewModel: AppViewModel,
    session: Session,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val s = LocalStrings.current
    val use24Hour = DateFormat.is24HourFormat(context)
    val scope = rememberCoroutineScope()
    var initialDelay by rememberSaveable { mutableStateOf(session.initialDelayMinutes.toString()) }
    var repeatInterval by rememberSaveable { mutableStateOf(session.repeatIntervalMinutes.toString()) }
    val waits = rememberSaveable(saver = listSaver({ it.toList() }, { it.toMutableStateList() })) {
        session.waitMinutes.map { it.toString() }.toMutableStateList()
    }
    var defaultWaitIndex by rememberSaveable { mutableIntStateOf(session.defaultWaitIndex) }
    var notificationGap by rememberSaveable {
        mutableStateOf(session.minNotificationGapSeconds.toString())
    }
    // An empty stored list means switched off, but the rows survive the toggle so
    // turning quiet hours back on doesn't mean setting the times up again.
    var quietHoursOn by rememberSaveable { mutableStateOf(session.quietHours.isNotEmpty()) }
    val quietHours = rememberSaveable(
        saver = listSaver(
            { list -> list.map { it.toString() } },
            { saved -> saved.mapNotNull(::parseQuietRange).toMutableStateList() },
        ),
    ) {
        session.quietHours.ifEmpty { DEFAULT_QUIET_HOURS }.toMutableStateList()
    }
    // Which end of which row the clock dialog is editing; -1 for closed.
    var editingQuietIndex by rememberSaveable { mutableIntStateOf(-1) }
    var editingQuietStart by rememberSaveable { mutableStateOf(true) }
    var showAdvanced by rememberSaveable { mutableStateOf(false) }
    var serverUrl by rememberSaveable { mutableStateOf(session.baseUrl) }
    var confirmServerChange by rememberSaveable { mutableStateOf(false) }
    var confirmClearCrashLog by rememberSaveable { mutableStateOf(false) }
    // Held as their storage forms so they survive process death like the rest.
    var soundKey by rememberSaveable { mutableStateOf(session.notificationSound.toStorageString()) }
    var streamName by rememberSaveable { mutableStateOf(session.soundStream.name) }
    var languageName by rememberSaveable { mutableStateOf(session.language.name) }
    val sound = parseNotificationSound(soundKey)
    val stream = SoundStream.valueOf(streamName)
    val language = LanguagePreference.valueOf(languageName)
    val snackbarHostState = remember { SnackbarHostState() }
    LaunchedEffect(Unit) { viewModel.refreshCrashLog() }
    val normalizedServerUrl = serverUrl.trim().trimEnd('/')

    val initialDelayValue = initialDelay.toIntOrNull()
    val repeatIntervalValue = repeatInterval.toIntOrNull()
    val waitValues = waits.map { it.toIntOrNull() }
    val notificationGapValue = notificationGap.toIntOrNull()
    val valid = (initialDelayValue ?: -1) >= 0 && (repeatIntervalValue ?: 0) >= 1 &&
        waitValues.isNotEmpty() && waitValues.all { (it ?: 0) >= 1 } &&
        defaultWaitIndex in waits.indices &&
        (notificationGapValue ?: -1) >= 0 &&
        (!quietHoursOn || quietHours.isNotEmpty())
    val effectiveQuietHours = if (quietHoursOn) quietHours.toList() else emptyList()

    // Measured against the stored session rather than a snapshot, so an Apply
    // makes the draft clean again and Undo always lands on what is in force.
    val changed = initialDelayValue != session.initialDelayMinutes ||
        repeatIntervalValue != session.repeatIntervalMinutes ||
        waitValues != session.waitMinutes ||
        defaultWaitIndex != session.defaultWaitIndex ||
        notificationGapValue != session.minNotificationGapSeconds ||
        effectiveQuietHours != session.quietHours ||
        sound != session.notificationSound ||
        stream != session.soundStream ||
        language != session.language

    fun undo() {
        initialDelay = session.initialDelayMinutes.toString()
        repeatInterval = session.repeatIntervalMinutes.toString()
        waits.clear()
        waits.addAll(session.waitMinutes.map { it.toString() })
        defaultWaitIndex = session.defaultWaitIndex
        notificationGap = session.minNotificationGapSeconds.toString()
        quietHoursOn = session.quietHours.isNotEmpty()
        quietHours.clear()
        quietHours.addAll(session.quietHours.ifEmpty { DEFAULT_QUIET_HOURS })
        soundKey = session.notificationSound.toStorageString()
        streamName = session.soundStream.name
        languageName = session.language.name
    }

    fun apply(onDone: () -> Unit) {
        viewModel.saveSettings(
            initialDelayValue!!,
            repeatIntervalValue!!,
            waitValues.map { it!! },
            defaultWaitIndex,
            effectiveQuietHours,
            notificationGapValue!!,
            sound,
            stream,
            language,
            onDone = onDone,
        )
    }

    // Leaving is the save: pending edits are applied on the way out. Invalid
    // ones hold the screen instead of being dropped, so nothing typed is lost
    // without the user choosing Undo.
    fun close() {
        when {
            viewModel.busy -> Unit
            !changed -> onBack()
            valid -> apply(onDone = onBack)
            else -> scope.launch {
                snackbarHostState.showSnackbar(s.fixHighlightedOrUndo)
            }
        }
    }

    BackHandler(onBack = ::close)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(s.settings) },
                navigationIcon = {
                    IconButton(onClick = ::close) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = s.back)
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        floatingActionButton = {
            AnimatedVisibility(visible = changed, enter = fadeIn() + scaleIn(), exit = fadeOut() + scaleOut()) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    ExtendedFloatingActionButton(
                        onClick = ::undo,
                        icon = { Icon(Icons.AutoMirrored.Filled.Undo, contentDescription = null) },
                        text = { Text(s.undo) },
                        containerColor = MaterialTheme.colorScheme.secondaryContainer,
                        contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                    )
                    ExtendedFloatingActionButton(
                        onClick = {
                            if (valid && !viewModel.busy) {
                                apply(onDone = {})
                            } else if (!valid) {
                                scope.launch { snackbarHostState.showSnackbar(s.fixHighlightedFirst) }
                            }
                        },
                        icon = { Icon(Icons.Filled.Check, contentDescription = null) },
                        text = { Text(s.applyAction) },
                    )
                }
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
        ) {
            LanguageSetting(
                current = language,
                onChosen = { languageName = it.name },
            )

            Spacer(Modifier.height(24.dp))

            Text(
                s.defaultsIntro,
                style = MaterialTheme.typography.bodyMedium,
            )

            Spacer(Modifier.height(16.dp))

            OutlinedTextField(
                value = initialDelay,
                onValueChange = { initialDelay = it },
                label = { Text(s.firstReminderAfter) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                isError = initialDelay.isNotEmpty() && (initialDelayValue ?: -1) < 0,
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(12.dp))

            OutlinedTextField(
                value = repeatInterval,
                onValueChange = { repeatInterval = it },
                label = { Text(s.thenNagEvery) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                isError = repeatInterval.isNotEmpty() && (repeatIntervalValue ?: 0) < 1,
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(24.dp))

            Text(
                s.snoozeIntro,
                style = MaterialTheme.typography.bodyMedium,
            )

            waits.forEachIndexed { index, wait ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp),
                ) {
                    OutlinedTextField(
                        value = wait,
                        onValueChange = { waits[index] = it },
                        label = { Text(s.waitField(index + 1)) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        isError = wait.isNotEmpty() && (waitValues[index] ?: 0) < 1,
                        modifier = Modifier.weight(1f),
                    )
                    RadioButton(
                        selected = index == defaultWaitIndex,
                        onClick = { defaultWaitIndex = index },
                    )
                    IconButton(
                        onClick = {
                            waits.removeAt(index)
                            // The default may have been removed or shifted left.
                            if (defaultWaitIndex >= index && defaultWaitIndex > 0) defaultWaitIndex--
                        },
                        // At least one wait must survive, or there is nothing to snooze with.
                        enabled = waits.size > 1,
                    ) {
                        Icon(Icons.Filled.Delete, contentDescription = s.removeWait(index + 1))
                    }
                }
            }

            TextButton(
                onClick = { waits.add("") },
                enabled = waits.size < MAX_WAITS,
            ) {
                Text(s.addWait)
            }

            Spacer(Modifier.height(24.dp))

            Text(
                s.gapIntro,
                style = MaterialTheme.typography.bodyMedium,
            )

            Spacer(Modifier.height(12.dp))

            OutlinedTextField(
                value = notificationGap,
                onValueChange = { notificationGap = it },
                label = { Text(s.minSecondsBetween) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                isError = notificationGap.isNotEmpty() && (notificationGapValue ?: -1) < 0,
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(24.dp))

            NotificationSoundSetting(
                current = sound,
                onChosen = { soundKey = it.toStorageString() },
                stream = stream,
                onStreamChosen = { streamName = it.name },
            )

            Spacer(Modifier.height(24.dp))

            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(s.quietHours, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                Switch(checked = quietHoursOn, onCheckedChange = { quietHoursOn = it })
            }

            Text(
                s.quietHoursIntro,
                style = MaterialTheme.typography.bodyMedium,
            )

            if (quietHoursOn) {
                quietHours.forEachIndexed { index, range ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 8.dp),
                    ) {
                        TextButton(onClick = {
                            editingQuietIndex = index
                            editingQuietStart = true
                        }) {
                            Text(formatTimeOfDay(range.startMinute, use24Hour))
                        }
                        Text(s.rangeTo, style = MaterialTheme.typography.bodyMedium)
                        TextButton(onClick = {
                            editingQuietIndex = index
                            editingQuietStart = false
                        }) {
                            Text(formatTimeOfDay(range.endMinute, use24Hour))
                        }
                        Spacer(Modifier.weight(1f))
                        IconButton(onClick = { quietHours.removeAt(index) }) {
                            Icon(
                                Icons.Filled.Delete,
                                contentDescription = s.removeQuietHours(index + 1),
                            )
                        }
                    }
                }

                TextButton(
                    onClick = { quietHours.add(DEFAULT_QUIET_HOURS.first()) },
                    enabled = quietHours.size < MAX_QUIET_RANGES,
                ) {
                    Text(s.addQuietHours)
                }

                if (quietHours.isEmpty()) {
                    Text(
                        s.addRangeOrSwitchOff,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }

            Spacer(Modifier.height(32.dp))

            Text(
                s.signedInAs(session.email ?: s.unknown),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = { viewModel.signOut() },
                enabled = !viewModel.busy,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(s.signOut)
            }

            Spacer(Modifier.height(8.dp))
            TextButton(onClick = { showAdvanced = !showAdvanced }) {
                Text(if (showAdvanced) s.hideAdvanced else s.advanced)
            }

            if (showAdvanced) {
                ServerUrlField(
                    value = serverUrl,
                    onValueChange = { serverUrl = it },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
                OutlinedButton(
                    onClick = { confirmServerChange = true },
                    enabled = !viewModel.busy && normalizedServerUrl.isNotBlank() &&
                        normalizedServerUrl != session.baseUrl,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(s.changeServerUrl)
                }

                Spacer(Modifier.height(12.dp))
                OutlinedButton(
                    onClick = { viewModel.showTestNotification() },
                    enabled = !viewModel.busy,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(s.sendTestNotification)
                }

                Spacer(Modifier.height(16.dp))
                val crashes = viewModel.crashLogSummary
                Text(
                    when (crashes.count) {
                        0 -> s.noCrashes
                        else -> s.crashesRecorded(
                            crashes.count,
                            crashes.latest?.let { formatDateTime(it.toEpochMilli(), use24Hour, s) } ?: s.unknown,
                        )
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
                OutlinedButton(
                    onClick = {
                        scope.launch {
                            val send = Intent(Intent.ACTION_SEND).apply {
                                type = "text/plain"
                                putExtra(Intent.EXTRA_SUBJECT, "RelentlessBadger crash log")
                                putExtra(Intent.EXTRA_TEXT, viewModel.crashLogText())
                            }
                            context.startActivity(Intent.createChooser(send, s.shareCrashLog))
                        }
                    },
                    enabled = crashes.count > 0,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(s.shareCrashLog)
                }
                Spacer(Modifier.height(8.dp))
                OutlinedButton(
                    onClick = { confirmClearCrashLog = true },
                    enabled = crashes.count > 0,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(s.clearCrashLog)
                }
            }

            viewModel.errorMessage?.let { message ->
                Spacer(Modifier.height(16.dp))
                Text(message, color = MaterialTheme.colorScheme.error)
            }

            // Room to scroll the last rows out from under the Apply and Undo buttons.
            Spacer(Modifier.height(88.dp))
        }
    }

    if (editingQuietIndex in quietHours.indices) {
        val range = quietHours[editingQuietIndex]
        val minute = if (editingQuietStart) range.startMinute else range.endMinute
        TimePickerDialog(
            initialHour = minute / 60,
            initialMinute = minute % 60,
            onDismiss = { editingQuietIndex = -1 },
            onPicked = { hour, pickedMinute ->
                val picked = hour * 60 + pickedMinute
                // A window that starts and ends at the same minute would silence
                // the whole day, so an edit that would do that is dropped.
                val other = if (editingQuietStart) range.endMinute else range.startMinute
                if (picked != other) {
                    quietHours[editingQuietIndex] = if (editingQuietStart) {
                        range.copy(startMinute = picked)
                    } else {
                        range.copy(endMinute = picked)
                    }
                }
                editingQuietIndex = -1
            },
        )
    }

    if (confirmClearCrashLog) {
        AlertDialog(
            onDismissRequest = { confirmClearCrashLog = false },
            title = { Text(s.clearCrashLogTitle) },
            text = { Text(s.clearCrashLogBody) },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmClearCrashLog = false
                        viewModel.clearCrashLog()
                    },
                ) {
                    Text(s.clear)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmClearCrashLog = false }) {
                    Text(s.cancel)
                }
            },
        )
    }

    if (confirmServerChange) {
        AlertDialog(
            onDismissRequest = { confirmServerChange = false },
            title = { Text(s.changeServerTitle) },
            text = {
                Text(s.changeServerBody)
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmServerChange = false
                        viewModel.changeServerUrl(serverUrl)
                    },
                ) {
                    Text(s.changeServer)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmServerChange = false }) {
                    Text(s.cancel)
                }
            },
        )
    }
}

/**
 * The language picker. Each language is named in itself, so someone lost in the
 * wrong one can still find theirs; "device default" also says which language
 * the device currently resolves to.
 */
@Composable
private fun LanguageSetting(current: LanguagePreference, onChosen: (LanguagePreference) -> Unit) {
    val s = LocalStrings.current
    var menuOpen by remember { mutableStateOf(false) }
    fun label(option: LanguagePreference): String = when (option) {
        LanguagePreference.System ->
            s.languageDeviceDefault(languageName(resolveLanguage(option, deviceLanguageTag())))
        LanguagePreference.English -> languageName(Language.English)
        LanguagePreference.Portuguese -> languageName(Language.Portuguese)
    }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(s.languageLabel, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
        Box {
            TextButton(onClick = { menuOpen = true }) {
                Text(label(current))
                Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
            }
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                LanguagePreference.entries.forEach { option ->
                    DropdownMenuItem(
                        text = { Text(label(option)) },
                        onClick = {
                            menuOpen = false
                            onChosen(option)
                        },
                    )
                }
            }
        }
    }
}

/** A language's name in that language, the same whatever the UI speaks. */
internal fun languageName(language: Language): String = when (language) {
    Language.English -> "English"
    Language.Portuguese -> "Português"
}
