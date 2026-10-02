package com.relentlessbadger.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.relentlessbadger.app.data.DoneEarlierCandidates

/**
 * Second step of "mark done earlier": with the moment picked, tick everything
 * that was done at it. Open tasks get completed there; completions already
 * recorded get moved there — the Done tapped this morning for last night's work.
 * Nothing starts ticked, since a stray confirm would close tasks still owed.
 */
@Composable
internal fun DoneEarlierDialog(
    atMillis: Long,
    candidates: DoneEarlierCandidates,
    use24Hour: Boolean,
    onChangeMoment: () -> Unit,
    onDismiss: () -> Unit,
    onConfirm: (openIds: List<String>, completedIds: List<String>) -> Unit,
) {
    val s = LocalStrings.current
    val openPicked = remember(candidates) { mutableStateListOf<String>() }
    val completedPicked = remember(candidates) { mutableStateListOf<String>() }
    val count = openPicked.size + completedPicked.size

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(s.doneEarlierAt(formatDateTime(atMillis, use24Hour, s))) },
        text = {
            Column(Modifier.heightIn(max = 480.dp).verticalScroll(rememberScrollState())) {
                TextButton(onClick = onChangeMoment) { Text(s.changeMoment) }
                if (candidates.open.isEmpty() && candidates.completed.isEmpty()) {
                    Text(s.nothingToMark, style = MaterialTheme.typography.bodyMedium)
                }
                if (candidates.open.isNotEmpty()) {
                    TaskSectionHeader(s.doneEarlierOpen)
                    candidates.open.forEach { task ->
                        CheckRow(
                            title = task.title,
                            supporting = null,
                            checked = task.id in openPicked,
                            onToggle = { openPicked.toggle(task.id) },
                        )
                    }
                }
                if (candidates.completed.isNotEmpty()) {
                    TaskSectionHeader(s.doneEarlierAlreadyDone)
                    candidates.completed.forEach { done ->
                        CheckRow(
                            title = done.title,
                            supporting = s.doneAtTime(formatDateTime(done.completedAtMillis, use24Hour, s)),
                            checked = done.id in completedPicked,
                            onToggle = { completedPicked.toggle(done.id) },
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = count > 0,
                onClick = { onConfirm(openPicked.toList(), completedPicked.toList()) },
            ) { Text(s.markNDone(count)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(s.cancel) }
        },
    )
}

@Composable
private fun CheckRow(title: String, supporting: String?, checked: Boolean, onToggle: () -> Unit) {
    ListItem(
        headlineContent = { Text(title, maxLines = 2, overflow = TextOverflow.Ellipsis) },
        supportingContent = supporting?.let { { Text(it) } },
        leadingContent = { Checkbox(checked = checked, onCheckedChange = { onToggle() }) },
        // The dialog's own surface shows through, rather than a list-coloured band.
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.clickable(onClick = onToggle),
    )
}

private fun MutableList<String>.toggle(id: String) {
    if (!remove(id)) add(id)
}
