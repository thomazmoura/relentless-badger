package com.relentlessbadger.app.ui

import android.text.format.DateFormat
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.relentlessbadger.app.data.CalendarEntry
import com.relentlessbadger.app.data.CalendarEntryKind
import com.relentlessbadger.app.data.buildMonthEntries
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CalendarScreen(viewModel: AppViewModel) {
    val tasks by viewModel.openTasks.collectAsState()
    val completed by viewModel.completedInMonth.collectAsState()
    val month by viewModel.calendarMonth.collectAsState()
    val selectedDate = viewModel.selectedCalendarDate
    val use24Hour = DateFormat.is24HourFormat(LocalContext.current)

    val showCancelled = viewModel.showCancelledInCalendar

    val entries = remember(tasks, completed, month, showCancelled) {
        buildMonthEntries(tasks, completed, month, includeCancelled = showCancelled)
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Calendar") }) },
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .padding(horizontal = 16.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = { viewModel.showCalendarMonth(month.minusMonths(1)) }) {
                    Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = "Previous month")
                }
                Text(
                    month.format(monthTitleFormatter),
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f),
                    textAlign = TextAlign.Center,
                )
                IconButton(onClick = { viewModel.showCalendarMonth(month.plusMonths(1)) }) {
                    Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = "Next month")
                }
            }

            Row(Modifier.fillMaxWidth()) {
                // Monday-first, matching the recurrence picker and bitmask.
                DayOfWeek.entries.forEach { day ->
                    Text(
                        day.getDisplayName(TextStyle.NARROW, Locale.getDefault()),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            val today = LocalDate.now()
            val firstDay = month.atDay(1)
            val leadingBlanks = firstDay.dayOfWeek.ordinal
            val totalCells = leadingBlanks + month.lengthOfMonth()
            for (week in 0 until (totalCells + 6) / 7) {
                Row(Modifier.fillMaxWidth()) {
                    for (slot in 0..6) {
                        val dayIndex = week * 7 + slot - leadingBlanks
                        if (dayIndex < 0 || dayIndex >= month.lengthOfMonth()) {
                            Spacer(Modifier.weight(1f).aspectRatio(1f))
                        } else {
                            val date = month.atDay(dayIndex + 1)
                            DayCell(
                                date = date,
                                selected = date == selectedDate,
                                today = date == today,
                                hasEntries = entries[date]?.isNotEmpty() == true,
                                onClick = { viewModel.selectedCalendarDate = date },
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(8.dp))
            HorizontalDivider()

            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    selectedDate.format(selectedDayFormatter),
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                FilterChip(
                    selected = showCancelled,
                    onClick = {
                        viewModel.showCancelledInCalendar = !showCancelled
                    },
                    label = { Text("Show cancelled") },
                )
            }

            val dayEntries = entries[selectedDate].orEmpty()
            if (dayEntries.isEmpty()) {
                Text(
                    "Nothing on this day.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = 16.dp),
                )
            } else {
                // LazyColumn anchors its scroll on the first visible item's key,
                // so revealing cancellations (which sort in by time, often above
                // the current top) would silently push them out of view.
                val listState = rememberLazyListState()
                LaunchedEffect(showCancelled, selectedDate) { listState.scrollToItem(0) }
                LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                    items(dayEntries, key = { "${it.taskId}:${it.atMillis}" }) { entry ->
                        CalendarEntryRow(entry, use24Hour)
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}

@Composable
private fun DayCell(
    date: LocalDate,
    selected: Boolean,
    today: Boolean,
    hasEntries: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .aspectRatio(1f)
            .padding(2.dp)
            .clip(CircleShape)
            .background(
                if (selected) MaterialTheme.colorScheme.primaryContainer
                else MaterialTheme.colorScheme.surface,
            )
            .then(
                if (today) {
                    Modifier.border(1.dp, MaterialTheme.colorScheme.primary, CircleShape)
                } else {
                    Modifier
                },
            )
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                date.dayOfMonth.toString(),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = if (today) FontWeight.Bold else FontWeight.Normal,
                color = when {
                    selected -> MaterialTheme.colorScheme.onPrimaryContainer
                    today -> MaterialTheme.colorScheme.primary
                    else -> MaterialTheme.colorScheme.onSurface
                },
            )
            Box(
                Modifier
                    .size(4.dp)
                    .clip(CircleShape)
                    .background(
                        when {
                            !hasEntries -> Color.Transparent
                            selected -> MaterialTheme.colorScheme.onPrimaryContainer
                            else -> MaterialTheme.colorScheme.primary
                        },
                    ),
            )
        }
    }
}

@Composable
private fun CalendarEntryRow(entry: CalendarEntry, use24Hour: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = when (entry.kind) {
                CalendarEntryKind.COMPLETED -> Icons.Filled.Check
                CalendarEntryKind.CANCELLED -> Icons.Filled.Close
                CalendarEntryKind.SCHEDULED -> Icons.Filled.Schedule
            },
            contentDescription = when (entry.kind) {
                CalendarEntryKind.COMPLETED -> "Completed"
                CalendarEntryKind.CANCELLED -> "Cancelled"
                CalendarEntryKind.SCHEDULED -> "Scheduled"
            },
            tint = when (entry.kind) {
                CalendarEntryKind.COMPLETED -> MaterialTheme.colorScheme.primary
                CalendarEntryKind.CANCELLED -> MaterialTheme.colorScheme.onSurfaceVariant
                CalendarEntryKind.SCHEDULED -> MaterialTheme.colorScheme.onSurfaceVariant
            },
            modifier = Modifier.size(20.dp),
        )
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                entry.title,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                // A cancellation must never read as an accomplishment.
                textDecoration = if (entry.kind == CalendarEntryKind.CANCELLED) {
                    TextDecoration.LineThrough
                } else {
                    null
                },
            )
            Text(
                when (entry.kind) {
                    CalendarEntryKind.COMPLETED -> "done ${formatDateTime(entry.atMillis, use24Hour)}"
                    CalendarEntryKind.CANCELLED -> "cancelled ${formatDateTime(entry.atMillis, use24Hour)}"
                    CalendarEntryKind.SCHEDULED -> "starts ${formatDateTime(entry.atMillis, use24Hour)}"
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (entry.recurring) {
            Icon(
                Icons.Filled.Repeat,
                contentDescription = "Repeats",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

private val monthTitleFormatter = DateTimeFormatter.ofPattern("MMMM yyyy")
private val selectedDayFormatter = DateTimeFormatter.ofPattern("EEEE, MMM d")
