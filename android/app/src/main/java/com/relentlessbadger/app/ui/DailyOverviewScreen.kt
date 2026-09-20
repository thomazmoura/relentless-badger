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
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.relentlessbadger.app.data.DailyOverview
import com.relentlessbadger.app.data.DailyOverviewItem
import com.relentlessbadger.app.data.buildDailyOverview
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The day at a glance: what is nagging right now, and what is still expected
 * before the day is out. Read-only on purpose — acting on a task is the Tasks
 * tab's job; this one is for looking, and for sending the list somewhere else.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DailyOverviewScreen(viewModel: AppViewModel) {
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

    val overview = remember(tasks, nowMillis) { buildDailyOverview(tasks, nowMillis) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Today") },
                actions = {
                    IconButton(onClick = {
                        shareOverview(
                            context,
                            renderDailyOverview(overview, use24Hour, OverviewTextStyle.MARKDOWN),
                        )
                    }) {
                        Icon(Icons.Filled.Share, contentDescription = "Share today")
                    }
                    IconButton(onClick = {
                        val copied = copyOverview(
                            context,
                            renderDailyOverview(overview, use24Hour, OverviewTextStyle.PLAIN),
                        )
                        if (copied) {
                            scope.launch { snackbarHostState.showSnackbar("Copied today's list") }
                        }
                    }) {
                        Icon(Icons.Filled.ContentCopy, contentDescription = "Copy today")
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
            if (overview.isEmpty) {
                Text(
                    "Nothing scheduled for today.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = 24.dp),
                )
                return@Column
            }

            LazyColumn(Modifier.fillMaxSize()) {
                if (overview.now.isNotEmpty()) {
                    item(key = NOW_HEADER_KEY) { SectionHeader("Now") }
                    items(overview.now, key = { "now:${it.taskId}" }) { item ->
                        OverviewRow(item, nagging = true, use24Hour = use24Hour)
                    }
                }
                if (overview.later.isNotEmpty()) {
                    item(key = LATER_HEADER_KEY) { SectionHeader("Later today") }
                    items(overview.later, key = { "later:${it.taskId}" }) { item ->
                        OverviewRow(item, nagging = false, use24Hour = use24Hour)
                    }
                }
            }
        }
    }
}

private const val NOW_HEADER_KEY = "header:now"
private const val LATER_HEADER_KEY = "header:later"

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
private fun OverviewRow(item: DailyOverviewItem, nagging: Boolean, use24Hour: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = if (nagging) Icons.Filled.NotificationsActive else Icons.Filled.Schedule,
            contentDescription = if (nagging) "Nagging" else "Scheduled",
            tint = if (nagging) {
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
                overviewTimeLabel(item, nagging, use24Hour),
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
    use24Hour: Boolean,
    style: OverviewTextStyle,
): String {
    val bold = if (style == OverviewTextStyle.MARKDOWN) "*" else ""
    val italic = if (style == OverviewTextStyle.MARKDOWN) "_" else ""
    val lines = mutableListOf("${bold}RelentlessBadger — Today$bold")

    if (overview.isEmpty) {
        lines += ""
        lines += "Nothing scheduled for today."
        return lines.joinToString("\n")
    }

    fun section(label: String, items: List<DailyOverviewItem>, nagging: Boolean) {
        if (items.isEmpty()) return
        lines += ""
        lines += "$bold$label$bold"
        items.forEach {
            lines += "• ${it.title} $italic(${overviewTimeLabel(it, nagging, use24Hour)})$italic"
        }
    }

    section("Now", overview.now, nagging = true)
    section("Later today", overview.later, nagging = false)
    return lines.joinToString("\n")
}

/**
 * "since 09:12" for something already nagging, plain "18:00" for what is still
 * to come. A nag carried over from an earlier day gets its date as well, since
 * a bare "since 6:30 PM" at lunchtime reads as a time that has not arrived yet.
 */
private fun overviewTimeLabel(
    item: DailyOverviewItem,
    nagging: Boolean,
    use24Hour: Boolean,
): String {
    val when_ = if (item.fromEarlierDay) {
        formatDateTime(item.atMillis, use24Hour)
    } else {
        formatTimeOfDay(item.atMillis, use24Hour)
    }
    return if (nagging) "since $when_" else when_
}

private fun shareOverview(context: Context, text: String) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
    }
    context.startActivity(Intent.createChooser(intent, "Share today"))
}

/** True when the app should say so itself; Android 13+ confirms the copy for us. */
private fun copyOverview(context: Context, text: String): Boolean {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText("Today", text))
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
}
