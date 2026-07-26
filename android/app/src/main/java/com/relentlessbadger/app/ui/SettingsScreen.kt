package com.relentlessbadger.app.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.toMutableStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.relentlessbadger.app.data.MAX_WAITS
import com.relentlessbadger.app.data.Session

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    viewModel: AppViewModel,
    session: Session,
    onBack: () -> Unit,
) {
    var initialDelay by rememberSaveable { mutableStateOf(session.initialDelayMinutes.toString()) }
    var repeatInterval by rememberSaveable { mutableStateOf(session.repeatIntervalMinutes.toString()) }
    val waits = rememberSaveable(saver = listSaver({ it.toList() }, { it.toMutableStateList() })) {
        session.waitMinutes.map { it.toString() }.toMutableStateList()
    }
    var defaultWaitIndex by rememberSaveable { mutableIntStateOf(session.defaultWaitIndex) }
    var showAdvanced by rememberSaveable { mutableStateOf(false) }
    var serverUrl by rememberSaveable { mutableStateOf(session.baseUrl) }
    var confirmServerChange by rememberSaveable { mutableStateOf(false) }
    val normalizedServerUrl = serverUrl.trim().trimEnd('/')

    val initialDelayValue = initialDelay.toIntOrNull()
    val repeatIntervalValue = repeatInterval.toIntOrNull()
    val waitValues = waits.map { it.toIntOrNull() }
    val valid = (initialDelayValue ?: 0) >= 1 && (repeatIntervalValue ?: 0) >= 1 &&
        waitValues.isNotEmpty() && waitValues.all { (it ?: 0) >= 1 } &&
        defaultWaitIndex in waits.indices

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
        ) {
            Text(
                "Defaults applied to every new task. Existing tasks keep the values they were created with.",
                style = MaterialTheme.typography.bodyMedium,
            )

            Spacer(Modifier.height(16.dp))

            OutlinedTextField(
                value = initialDelay,
                onValueChange = { initialDelay = it },
                label = { Text("First reminder after (minutes)") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                isError = initialDelay.isNotEmpty() && (initialDelayValue ?: 0) < 1,
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(12.dp))

            OutlinedTextField(
                value = repeatInterval,
                onValueChange = { repeatInterval = it },
                label = { Text("Then nag every (minutes)") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                isError = repeatInterval.isNotEmpty() && (repeatIntervalValue ?: 0) < 1,
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(24.dp))

            Text(
                "Snooze options shown on tasks and reminders. Pick how far each pushes " +
                    "the next nag. The one marked default is the reminder's one-tap Wait button.",
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
                        label = { Text("Wait ${index + 1} (minutes)") },
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
                        Icon(Icons.Filled.Delete, contentDescription = "Remove wait ${index + 1}")
                    }
                }
            }

            TextButton(
                onClick = { waits.add("") },
                enabled = waits.size < MAX_WAITS,
            ) {
                Text("Add wait")
            }

            Spacer(Modifier.height(24.dp))

            Button(
                onClick = {
                    viewModel.saveSettings(
                        initialDelayValue!!,
                        repeatIntervalValue!!,
                        waitValues.map { it!! },
                        defaultWaitIndex,
                        onDone = onBack,
                    )
                },
                enabled = valid && !viewModel.busy,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Save")
            }

            Spacer(Modifier.height(32.dp))

            Text(
                "Signed in as ${session.email ?: "unknown"}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = { viewModel.signOut() },
                enabled = !viewModel.busy,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Sign out")
            }

            Spacer(Modifier.height(8.dp))
            TextButton(onClick = { showAdvanced = !showAdvanced }) {
                Text(if (showAdvanced) "Hide advanced" else "Advanced")
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
                    Text("Change server URL")
                }
            }

            viewModel.errorMessage?.let { message ->
                Spacer(Modifier.height(16.dp))
                Text(message, color = MaterialTheme.colorScheme.error)
            }
        }
    }

    if (confirmServerChange) {
        AlertDialog(
            onDismissRequest = { confirmServerChange = false },
            title = { Text("Change server?") },
            text = {
                Text(
                    "Your current session may be rejected by the new server, and you " +
                        "may need to sign in again. Your tasks stay on this device " +
                        "and will sync to the new server.",
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmServerChange = false
                        viewModel.changeServerUrl(serverUrl)
                    },
                ) {
                    Text("Change server")
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmServerChange = false }) {
                    Text("Cancel")
                }
            },
        )
    }
}
