package com.relentlessbadger.app.ui

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

enum class ReportKind(val label: (Strings) -> String) {
    TODAY({ it.reportToday }),
    RECURRING({ it.reportRecurring }),
}

/**
 * The Reports tab: one read-only report at a time, picked from a switch at the
 * top. Each report owns its own top bar, so Share and Copy always send the one
 * on screen, under its own name.
 */
@Composable
fun ReportsScreen(viewModel: AppViewModel) {
    var kind by rememberSaveable { mutableStateOf(ReportKind.TODAY) }
    val switch = @Composable { ReportSwitch(kind, onChosen = { kind = it }) }
    when (kind) {
        ReportKind.TODAY -> DailyOverviewScreen(viewModel, header = switch)
        ReportKind.RECURRING -> RecurringReportScreen(viewModel, header = switch)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReportSwitch(selected: ReportKind, onChosen: (ReportKind) -> Unit) {
    val s = LocalStrings.current
    SingleChoiceSegmentedButtonRow(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 4.dp, bottom = 4.dp),
    ) {
        ReportKind.entries.forEach { kind ->
            SegmentedButton(
                selected = kind == selected,
                onClick = { onChosen(kind) },
                shape = SegmentedButtonDefaults.itemShape(kind.ordinal, ReportKind.entries.size),
            ) {
                Text(kind.label(s))
            }
        }
    }
}
