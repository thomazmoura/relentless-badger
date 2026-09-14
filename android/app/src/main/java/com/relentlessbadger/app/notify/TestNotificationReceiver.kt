package com.relentlessbadger.app.notify

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Handles every button on the test notification. It has no task behind it, so
 * the only sensible response to any of them is to take it away.
 */
class TestNotificationReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        Notifications.cancel(context, Notifications.TEST_NOTIFICATION_ID)
    }
}
