package com.relentlessbadger.app

import android.app.Application
import android.content.Context
import androidx.room.Room
import com.relentlessbadger.app.data.ApiClient
import com.relentlessbadger.app.data.SessionStore
import com.relentlessbadger.app.data.TaskRepository
import com.relentlessbadger.app.db.BadgerDb
import com.relentlessbadger.app.notify.AlarmReminderScheduler
import com.relentlessbadger.app.notify.Notifications
import com.relentlessbadger.app.notify.ReminderScheduler
import com.relentlessbadger.app.sync.WorkManagerSyncScheduler
import kotlinx.coroutines.runBlocking

class AppContainer(context: Context) {
    val session = SessionStore(context)
    val apiClient = ApiClient(session)
    private val db = Room.databaseBuilder(context, BadgerDb::class.java, "badger.db")
        // Local data is the source of truth (offline creates/completions live
        // only here until pushed), so upgrades must migrate, never wipe.
        .addMigrations(
            BadgerDb.MIGRATION_2_3, BadgerDb.MIGRATION_3_4,
            BadgerDb.MIGRATION_4_5, BadgerDb.MIGRATION_5_6,
        )
        .build()
    val taskDao = db.openTaskDao()
    val titleDao = db.titleHistoryDao()
    val completedTaskDao = db.completedTaskDao()
    val scheduler: ReminderScheduler = AlarmReminderScheduler(context)
    val syncScheduler = WorkManagerSyncScheduler(context)
    val repository = TaskRepository(apiClient, taskDao, titleDao, completedTaskDao, scheduler, session, syncScheduler)
}

class BadgerApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        Notifications.ensureChannel(this)
        // Warm the token/baseUrl mirrors before any receiver touches the API.
        val session = runBlocking { container.session.current() }
        if (session.isSignedIn) {
            // Flush anything queued while the app was dead and keep a
            // periodic pull armed.
            container.syncScheduler.requestSync()
            container.syncScheduler.ensurePeriodic()
        }
    }
}
