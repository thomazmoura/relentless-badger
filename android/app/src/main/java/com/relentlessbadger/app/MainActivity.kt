package com.relentlessbadger.app

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.ScrollableDefaults
import androidx.compose.foundation.gestures.scrollable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerDefaults
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalLayoutDirection
import com.relentlessbadger.app.notify.Notifications
import com.relentlessbadger.app.ui.AppViewModel
import com.relentlessbadger.app.ui.CalendarScreen
import com.relentlessbadger.app.ui.MainScreen
import com.relentlessbadger.app.ui.SettingsScreen
import com.relentlessbadger.app.ui.SignInScreen
import com.relentlessbadger.app.ui.theme.BadgerTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private val viewModel: AppViewModel by viewModels {
        AppViewModel.factory((application as BadgerApp).container)
    }

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    /** Set by the reminder notification's "Other…" action; consumed once by [App]. */
    private var waitPickerTaskId by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        readWaitPickerRequest(intent)
        setContent {
            BadgerTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    App(
                        viewModel = viewModel,
                        requestNotificationPermission = ::requestNotificationPermission,
                        waitPickerTaskId = waitPickerTaskId,
                        onWaitPickerHandled = { waitPickerTaskId = null },
                    )
                }
            }
        }
    }

    // launchMode is singleTask, so a tap while the app is already running
    // arrives here instead of onCreate.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        readWaitPickerRequest(intent)
    }

    private fun readWaitPickerRequest(intent: Intent?) {
        if (intent?.getBooleanExtra(Notifications.EXTRA_SHOW_WAIT_PICKER, false) != true) return
        waitPickerTaskId = intent.getStringExtra(Notifications.EXTRA_TASK_ID)
        // Cleared so a configuration change or a plain relaunch doesn't reopen
        // the picker from the same stale intent.
        intent.removeExtra(Notifications.EXTRA_SHOW_WAIT_PICKER)
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}

private enum class Tab(val label: String, val icon: ImageVector) {
    Tasks("Tasks", Icons.Filled.Checklist),
    Calendar("Calendar", Icons.Filled.CalendarMonth),
}

@Composable
private fun App(
    viewModel: AppViewModel,
    requestNotificationPermission: () -> Unit,
    waitPickerTaskId: String?,
    onWaitPickerHandled: () -> Unit,
) {
    val session by viewModel.session.collectAsState()
    // Above the when, so the selected tab survives the Settings round-trip.
    val pagerState = rememberPagerState(initialPage = Tab.Tasks.ordinal) { Tab.entries.size }
    var showSettings by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    // The picker lives on the Tasks tab, so surface it whatever the app was
    // showing when the notification action was tapped.
    LaunchedEffect(waitPickerTaskId) {
        val taskId = waitPickerTaskId ?: return@LaunchedEffect
        showSettings = false
        pagerState.scrollToPage(Tab.Tasks.ordinal)
        viewModel.openWaitPicker(taskId)
        onWaitPickerHandled()
    }

    when {
        session == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }

        !session!!.isSignedIn -> SignInScreen(viewModel)

        showSettings -> SettingsScreen(
            viewModel = viewModel,
            session = session!!,
            onBack = { showSettings = false },
        )

        else -> Scaffold(
            bottomBar = {
                // Swiping the bar drags the pager just like swiping the pages.
                // Pager content moves opposite to scroll position, hence the
                // reverseDirection matching what the pager uses internally.
                NavigationBar(
                    modifier = Modifier.scrollable(
                        state = pagerState,
                        orientation = Orientation.Horizontal,
                        reverseDirection = ScrollableDefaults.reverseDirection(
                            LocalLayoutDirection.current,
                            Orientation.Horizontal,
                            reverseScrolling = false,
                        ),
                        flingBehavior = PagerDefaults.flingBehavior(state = pagerState),
                    ),
                ) {
                    Tab.entries.forEach { t ->
                        NavigationBarItem(
                            selected = pagerState.currentPage == t.ordinal,
                            onClick = { scope.launch { pagerState.animateScrollToPage(t.ordinal) } },
                            icon = { Icon(t.icon, contentDescription = t.label) },
                            label = { Text(t.label) },
                        )
                    }
                }
            },
        ) { padding ->
            HorizontalPager(
                state = pagerState,
                modifier = Modifier.padding(padding),
            ) { page ->
                when (Tab.entries[page]) {
                    Tab.Tasks -> MainScreen(
                        viewModel = viewModel,
                        onOpenSettings = { showSettings = true },
                        requestNotificationPermission = requestNotificationPermission,
                    )
                    Tab.Calendar -> CalendarScreen(viewModel)
                }
            }
        }
    }
}
