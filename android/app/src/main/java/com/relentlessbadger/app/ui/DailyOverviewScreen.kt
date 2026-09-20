package com.relentlessbadger.app.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Build
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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.relentlessbadger.app.data.DailyOverview
import com.relentlessbadger.app.data.DailyOverviewItem
import com.relentlessbadger.app.data.OverviewSectionKind
import com.relentlessbadger.app.data.buildDailyOverview
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * A day at a glance: on today, what is nagging right now and what is still
 * expected before the day is out; on any other day, what it left behind or what
 * it will bring. Read-only on purpose — acting on a task is the Tasks tab's job;
 * this one is for looking, and for sending the list somewhere else.
 *
 * [date] null means today, followed live: the screen re-reads the clock so a
 * task crossing its start time moves up on its own and the digest rolls over at
 * midnight. A given date is fixed, and gets [onBack] to leave by.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DailyOverviewScreen(
    viewModel: AppViewModel,
    date: LocalDate? = null,
    onBack: (() -> Unit)? = null,
) {
    val tasks by viewModel.openTasks.collectAsState()
    val context = LocalContext.current
    val use24Hour = DateFormat.is24HourFormat(context)
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    // Ticks so a task crossing its start time moves from "Later today" up into
    // "Now" on its own, without waiting for a data change.
    val nowMillis by produceState(System.currentTimeMillis()) {
        while (true) {
            delay(15_000)
            value = System.currentTimeMillis()
        }
    }
    val shownDate = date ?: Instant.ofEpochMilli(nowMillis).atZone(ZoneId.systemDefault()).toLocalDate()
    // Looking back, the day's point is what came of it, so completions lead;
    // today's point is what is still owed, so they stay out of the way.
    var includeConcluded by remember(date) { mutableStateOf(date != null && date < LocalDate.now()) }
    val completed by remember(shownDate) { viewModel.completedOnDay(shownDate) }
        .collectAsState(emptyList())

    val overview = remember(tasks, completed, shownDate, nowMillis, includeConcluded) {
        buildDailyOverview(tasks, completed, shownDate, nowMillis, includeConcluded)
    }
    val title = if (date == null) "Today" else formatDayTitle(date)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = {
                    if (onBack != null) {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                        }
                    }
                },
                actions = {
                    IconButton(onClick = {
                        shareOverview(
                            context,
                            title,
                            renderDailyOverview(overview, title, use24Hour, OverviewTextStyle.MARKDOWN),
                        )
                    }) {
                        Icon(Icons.Filled.Share, contentDescription = "Share $title")
                    }
                    IconButton(onClick = {
                        val copied = copyOverview(
                            context,
                            title,
                            renderDailyOverview(overview, title, use24Hour, OverviewTextStyle.PLAIN),
                        )
                        if (copied) {
                            scope.launch { snackbarHostState.showSnackbar("Copied the list") }
                        }
                    }) {
                        Icon(Icons.Filled.ContentCopy, contentDescription = "Copy $title")
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
            FilterChip(
                selected = includeConcluded,
                onClick = { includeConcluded = !includeConcluded },
                label = { Text("Show completed") },
                modifier = Modifier.padding(top = 4.dp),
            )

            if (overview.isEmpty) {
                Text(
                    "Nothing on this day.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = 24.dp),
                )
                return@Column
            }

            LazyColumn(Modifier.fillMaxSize()) {
                overview.sections.forEach { section ->
                    item(key = "header:${section.kind}") { SectionHeader(sectionLabel(section.kind)) }
                    items(section.items, key = { "${section.kind}:${it.taskId}" }) { item ->
                        OverviewRow(item, section.kind, use24Hour)
                    }
                }
            }
        }
    }
}

/** Compose labels are hardcoded English; these are the five a day can carry. */
internal fun sectionLabel(kind: OverviewSectionKind): String = when (kind) {
    OverviewSectionKind.NOW -> "Now"
    OverviewSectionKind.LATER -> "Later today"
    OverviewSectionKind.SCHEDULED -> "Scheduled"
    OverviewSectionKind.OVERDUE -> "Overdue"
    OverviewSectionKind.DONE -> "Done"
}

@Composable
private fun SectionHeader(label: String) {
    Text(
        label,
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.primary,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(top = 16.dp, bottom = 4.dp),
    )
}

@Composable
private fun OverviewRow(item: DailyOverviewItem, kind: OverviewSectionKind, use24Hour: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val nagging = kind == OverviewSectionKind.NOW || kind == OverviewSectionKind.OVERDUE
        Icon(
            imageVector = when {
                kind == OverviewSectionKind.DONE -> Icons.Filled.Check
                nagging -> Icons.Filled.NotificationsActive
                else -> Icons.Filled.Schedule
            },
            contentDescription = sectionLabel(kind),
            tint = if (kind == OverviewSectionKind.LATER || kind == OverviewSectionKind.SCHEDULED) {
                MaterialTheme.colorScheme.onSurfaceVariant
            } else {
                MaterialTheme.colorScheme.primary
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
                overviewTimeLabel(item, kind, use24Hour),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (item.recurring) {
            Icon(
                Icons.Filled.Repeat,
                contentDescription = "Repeats",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

// --- Export -----------------------------------------------------------------

enum class OverviewTextStyle { MARKDOWN, PLAIN }

/**
 * The screen as a message. [OverviewTextStyle.MARKDOWN] carries the markers
 * WhatsApp and Telegram render (`*bold*`, `_italic_`); [OverviewTextStyle.PLAIN]
 * is the same text with those markers dropped, for a clipboard that has no idea
 * where it is going.
 */
internal fun renderDailyOverview(
    overview: DailyOverview,
    title: String,
    use24Hour: Boolean,
    style: OverviewTextStyle,
): String {
    val bold = if (style == OverviewTextStyle.MARKDOWN) "*" else ""
    val italic = if (style == OverviewTextStyle.MARKDOWN) "_" else ""
    val lines = mutableListOf("${bold}RelentlessBadger — $title$bold")

    if (overview.isEmpty) {
        lines += ""
        lines += "Nothing on this day."
        return lines.joinToString("\n")
    }

    overview.sections.forEach { section ->
        lines += ""
        lines += "$bold${sectionLabel(section.kind)}$bold"
        section.items.forEach {
            lines += "• ${it.title} $italic(${overviewTimeLabel(it, section.kind, use24Hour)})$italic"
        }
    }
    return lines.joinToString("\n")
}

/**
 * "since 09:12" for something already nagging, "was due 09:12" for a debt an
 * earlier day left behind, "done 09:12" for a completion, plain "18:00" for
 * what is still to come. A nag carried over from an earlier day gets its date
 * as well, since a bare "since 6:30 PM" at lunchtime reads as a time that has
 * not arrived yet.
 */
internal fun overviewTimeLabel(
    item: DailyOverviewItem,
    kind: OverviewSectionKind,
    use24Hour: Boolean,
): String {
    val when_ = if (item.fromEarlierDay) {
        formatDateTime(item.atMillis, use24Hour)
    } else {
        formatTimeOfDay(item.atMillis, use24Hour)
    }
    return when (kind) {
        OverviewSectionKind.NOW -> "since $when_"
        OverviewSectionKind.OVERDUE -> "was due $when_"
        OverviewSectionKind.DONE -> "done $when_"
        OverviewSectionKind.LATER, OverviewSectionKind.SCHEDULED -> when_
    }
}

private fun shareOverview(context: Context, title: String, text: String) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
    }
    context.startActivity(Intent.createChooser(intent, "Share $title"))
}

/** True when the app should say so itself; Android 13+ confirms the copy for us. */
private fun copyOverview(context: Context, title: String, text: String): Boolean {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText(title, text))
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
}
