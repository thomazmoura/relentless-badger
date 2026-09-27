package com.relentlessbadger.app.ui

import android.text.format.DateFormat
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.relentlessbadger.app.data.RecurringCadence
import com.relentlessbadger.app.data.RecurringReport
import com.relentlessbadger.app.data.RecurringReportItem
import com.relentlessbadger.app.data.buildRecurringReport

/**
 * Every recurring series at a glance: how often it repeats, the hour it fires
 * at and when it fires next. Read-only, like the Today report, and shareable
 * the same way. [header] sits above the list, where the Reports tab puts its
 * report switch.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecurringReportScreen(
    viewModel: AppViewModel,
    header: @Composable () -> Unit = {},
) {
    val tasks by viewModel.openTasks.collectAsState()
    val use24Hour = DateFormat.is24HourFormat(LocalContext.current)
    val snackbarHostState = remember { SnackbarHostState() }
    // Ticks so an occurrence reaching its start time turns into "nagging" on its own.
    val nowMillis = rememberTickingNow()
    val report = remember(tasks, nowMillis) { buildRecurringReport(tasks, nowMillis) }
    val title = "Recurring"

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                actions = {
                    ReportActions(title, snackbarHostState) { style ->
                        renderRecurringReport(report, title, use24Hour, style)
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .padding(horizontal = 16.dp),
        ) {
            header()

            if (report.isEmpty) {
                Text(
                    "No recurring tasks.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = 24.dp),
                )
                return@Column
            }

            LazyColumn(Modifier.fillMaxSize()) {
                report.sections.forEach { section ->
                    item(key = "header:${section.cadence}") { SectionHeader(cadenceLabel(section.cadence)) }
                    items(section.items, key = { it.taskId }) { item -> RecurringRow(item, use24Hour) }
                }
            }
        }
    }
}

@Composable
private fun RecurringRow(item: RecurringReportItem, use24Hour: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = if (item.nagging) Icons.Filled.NotificationsActive else Icons.Filled.Repeat,
            contentDescription = if (item.nagging) "Nagging" else "Repeats",
            tint = if (item.nagging) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
            modifier = Modifier.size(20.dp),
        )
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                item.title,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                recurringScheduleLabel(item, use24Hour),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                recurringNextLabel(item, use24Hour),
                style = MaterialTheme.typography.bodySmall,
                color = if (item.nagging) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
        }
    }
}

// --- Export -----------------------------------------------------------------

/** The screen as a message, in the same two styles as [renderDailyOverview]. */
internal fun renderRecurringReport(
    report: RecurringReport,
    title: String,
    use24Hour: Boolean,
    style: OverviewTextStyle,
): String {
    val bold = if (style == OverviewTextStyle.MARKDOWN) "*" else ""
    val italic = if (style == OverviewTextStyle.MARKDOWN) "_" else ""
    val lines = mutableListOf("${bold}RelentlessBadger — $title$bold")

    if (report.isEmpty) {
        lines += ""
        lines += "No recurring tasks."
        return lines.joinToString("\n")
    }

    report.sections.forEach { section ->
        lines += ""
        lines += "$bold${cadenceLabel(section.cadence)}$bold"
        section.items.forEach {
            lines += "• ${it.title} " +
                "$italic(${recurringScheduleLabel(it, use24Hour)} · ${recurringNextLabel(it, use24Hour)})$italic"
        }
    }
    return lines.joinToString("\n")
}

internal fun cadenceLabel(cadence: RecurringCadence): String = when (cadence) {
    RecurringCadence.DAILY -> "Daily"
    RecurringCadence.WEEKLY -> "Weekly"
    RecurringCadence.OTHER -> "Less regular"
}

/** "every day at 09:00", "every 2 weeks · Mon, Wed at 6:30 PM". */
internal fun recurringScheduleLabel(item: RecurringReportItem, use24Hour: Boolean): String =
    "${recurrenceLabel(item.recurrence)} at ${formatTimeOfDay(item.anchorMillis, use24Hour)}"

/** "next Sep 28, 09:00", or "nagging since Sep 26, 09:00" once it has begun. */
internal fun recurringNextLabel(item: RecurringReportItem, use24Hour: Boolean): String {
    val at = formatDateTime(item.nextAtMillis, use24Hour)
    return if (item.nagging) "nagging since $at" else "next $at"
}
