package com.relentlessbadger.app.ui

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.IntentCompat
import com.relentlessbadger.app.data.BUILT_IN_SOUNDS
import com.relentlessbadger.app.data.NotificationSound
import com.relentlessbadger.app.data.label
import com.relentlessbadger.app.data.parseNotificationSound
import com.relentlessbadger.app.data.toStorageString
import com.relentlessbadger.app.notify.Notifications

/**
 * The "Notification sound" row: shows the current choice and opens a dialog
 * that previews each option as it is tapped, so picking a sound means hearing
 * it. The dialog's choice is applied on OK; a sound from the device picker is
 * applied straight away, since picking it there was already the decision.
 *
 * Below it, the opt-in to ring at alarm volume. Android-only by nature: a web
 * page can't choose the stream its notifications play on, so the PWA has no
 * counterpart to mirror.
 */
@Composable
fun NotificationSoundSetting(
    current: NotificationSound,
    onChosen: (NotificationSound) -> Unit,
    alarmStream: Boolean,
    onAlarmStreamChanged: (Boolean) -> Unit,
) {
    val context = LocalContext.current
    var dialogOpen by rememberSaveable { mutableStateOf(false) }

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            "Notification sound",
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier.weight(1f),
        )
        TextButton(onClick = { dialogOpen = true }) { Text(current.label()) }
    }
    Text(
        "Built-in sounds: Google Material, CC-BY 4.0",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )

    // Silent has nothing to play on any stream.
    val canUseAlarmStream = current != NotificationSound.Silent
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
    ) {
        Text(
            "Play even on vibrate",
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier.weight(1f),
        )
        Switch(
            checked = alarmStream && canUseAlarmStream,
            onCheckedChange = onAlarmStreamChanged,
            enabled = canUseAlarmStream,
        )
    }
    Text(
        "Uses the alarm volume instead of the notification volume, so reminders " +
            "sound even when the phone is on vibrate or silent.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )

    if (dialogOpen) {
        NotificationSoundDialog(
            context = context,
            current = current,
            alarmStream = alarmStream,
            onDismiss = { dialogOpen = false },
            onChosen = {
                dialogOpen = false
                onChosen(it)
            },
        )
    }
}

@Composable
private fun NotificationSoundDialog(
    context: Context,
    current: NotificationSound,
    alarmStream: Boolean,
    onDismiss: () -> Unit,
    onChosen: (NotificationSound) -> Unit,
) {
    // Stored as its string form, which is what makes a sealed type saveable.
    var selectedStored by rememberSaveable { mutableStateOf(current.toStorageString()) }
    val selected = parseNotificationSound(selectedStored)
    val preview = remember(alarmStream) { SoundPreview(context, alarmStream) }
    DisposableEffect(Unit) { onDispose { preview.stop() } }

    val devicePicker = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        if (result.resultCode != Activity.RESULT_OK) return@rememberLauncherForActivityResult
        val uri = result.data?.let {
            IntentCompat.getParcelableExtra(it, RingtoneManager.EXTRA_RINGTONE_PICKED_URI, Uri::class.java)
        } ?: return@rememberLauncherForActivityResult
        val title = RingtoneManager.getRingtone(context, uri)?.getTitle(context) ?: "Custom sound"
        onChosen(NotificationSound.Custom(uri.toString(), title))
    }

    // The device-picked sound stays on the list while it is the current one, so
    // looking at the other options doesn't lose it.
    val options = buildList {
        add(NotificationSound.Silent)
        add(NotificationSound.SystemDefault)
        BUILT_IN_SOUNDS.forEach { add(NotificationSound.BuiltIn(it.key)) }
        if (current is NotificationSound.Custom) add(current)
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Notification sound") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                options.forEach { option ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                selectedStored = option.toStorageString()
                                preview.play(option)
                            },
                    ) {
                        RadioButton(selected = option == selected, onClick = null)
                        Text(option.label(), modifier = Modifier.padding(start = 12.dp, top = 12.dp, bottom = 12.dp))
                    }
                }
                TextButton(
                    onClick = {
                        preview.stop()
                        devicePicker.launch(
                            Intent(RingtoneManager.ACTION_RINGTONE_PICKER)
                                .putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_NOTIFICATION)
                                .putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false)
                                .putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, false)
                                .putExtra(
                                    RingtoneManager.EXTRA_RINGTONE_EXISTING_URI,
                                    (current as? NotificationSound.Custom)?.let { Uri.parse(it.uri) },
                                ),
                        )
                    },
                ) {
                    Text("Choose from device…")
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onChosen(selected) }) { Text("OK") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

/**
 * Plays one option at a time; tapping the next cuts the last one off. Plays on
 * the stream the reminders will, so what the preview's volume suggests is true.
 */
private class SoundPreview(private val context: Context, private val alarmStream: Boolean) {
    private var playing: Ringtone? = null

    fun play(sound: NotificationSound) {
        stop()
        val uri = Notifications.soundUri(context, sound) ?: return
        playing = RingtoneManager.getRingtone(context, uri)?.also {
            it.audioAttributes = Notifications.audioAttributesFor(alarmStream)
            it.play()
        }
    }

    fun stop() {
        playing?.stop()
        playing = null
    }
}
