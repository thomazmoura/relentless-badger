package com.relentlessbadger.app.ui

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import java.time.LocalTime
import java.time.format.DateTimeFormatter

/**
 * A clock face in a dialog, handing back the picked time of day. Shared by the
 * date-then-time flow and the quiet hours rows, which pick a wall-clock time
 * with no date attached. 12- or 24-hour follows the system setting.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TimePickerDialog(
    initialHour: Int,
    initialMinute: Int,
    onDismiss: () -> Unit,
    onPicked: (hour: Int, minute: Int) -> Unit,
) {
    val timeState = rememberTimePickerState(
        initialHour = initialHour,
        initialMinute = initialMinute,
    )
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = { onPicked(timeState.hour, timeState.minute) }) { Text("Set") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
        text = { TimePicker(state = timeState) },
    )
}

private val timeFormatter12: DateTimeFormatter = DateTimeFormatter.ofPattern("h:mm a")
private val timeFormatter24: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

/** A minute of the day as a clock time, in the system's 12- or 24-hour style. */
internal fun formatTimeOfDay(minuteOfDay: Int, use24Hour: Boolean): String =
    LocalTime.of(minuteOfDay / 60, minuteOfDay % 60)
        .format(if (use24Hour) timeFormatter24 else timeFormatter12)
