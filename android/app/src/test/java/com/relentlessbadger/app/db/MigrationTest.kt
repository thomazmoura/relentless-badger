package com.relentlessbadger.app.db

import android.app.Application
import android.database.sqlite.SQLiteDatabase
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class MigrationTest {

    @Test
    fun `existing v2 data survives the migration to v3`() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        val dbFile = context.getDatabasePath("migration-test.db")
        dbFile.parentFile?.mkdirs()
        dbFile.delete()

        // The exact schema Room generated for version 2 (pre title_history,
        // pre pendingCreate), with a task an existing install would have.
        SQLiteDatabase.openOrCreateDatabase(dbFile, null).use { old ->
            old.execSQL(
                "CREATE TABLE IF NOT EXISTS `open_tasks` (`id` TEXT NOT NULL, " +
                    "`title` TEXT NOT NULL, `createdAtMillis` INTEGER NOT NULL, " +
                    "`initialDelayMinutes` INTEGER NOT NULL, `repeatIntervalMinutes` INTEGER NOT NULL, " +
                    "`firstWarningAtMillis` INTEGER, `nextFireAtMillis` INTEGER NOT NULL, " +
                    "`pendingDone` INTEGER NOT NULL, PRIMARY KEY(`id`))",
            )
            old.execSQL(
                "INSERT INTO open_tasks VALUES ('task-1', 'water plants', 1000, 60, 15, NULL, 2000, 0)",
            )
            old.version = 2
        }

        val db = Room.databaseBuilder(context, BadgerDb::class.java, "migration-test.db")
            .addMigrations(
                BadgerDb.MIGRATION_2_3, BadgerDb.MIGRATION_3_4,
                BadgerDb.MIGRATION_4_5, BadgerDb.MIGRATION_5_6,
                BadgerDb.MIGRATION_6_7,
            )
            .allowMainThreadQueries()
            .build()
        try {
            runBlocking {
                val task = db.openTaskDao().getAll().single()
                assertEquals("task-1", task.id)
                assertEquals("water plants", task.title)
                assertEquals(2000L, task.nextFireAtMillis)
                assertFalse("migrated rows are not pending creates", task.pendingCreate)

                db.titleHistoryDao().recordUse("water plants", 3000L)
                assertEquals(listOf("water plants"), db.titleHistoryDao().getRanked())
            }
        } finally {
            db.close()
        }
    }

    @Test
    fun `existing v3 data survives the migration to v4`() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        val dbFile = context.getDatabasePath("migration-test-v3.db")
        dbFile.parentFile?.mkdirs()
        dbFile.delete()

        // The exact schema Room generated for version 3 (pre recurrence,
        // pre pendingUpdate), with a task an existing install would have.
        SQLiteDatabase.openOrCreateDatabase(dbFile, null).use { old ->
            old.execSQL(
                "CREATE TABLE IF NOT EXISTS `open_tasks` (`id` TEXT NOT NULL, " +
                    "`title` TEXT NOT NULL, `createdAtMillis` INTEGER NOT NULL, " +
                    "`initialDelayMinutes` INTEGER NOT NULL, `repeatIntervalMinutes` INTEGER NOT NULL, " +
                    "`firstWarningAtMillis` INTEGER, `nextFireAtMillis` INTEGER NOT NULL, " +
                    "`pendingDone` INTEGER NOT NULL, `pendingCreate` INTEGER NOT NULL, " +
                    "PRIMARY KEY(`id`))",
            )
            old.execSQL(
                "CREATE TABLE IF NOT EXISTS `title_history` (`title` TEXT NOT NULL, " +
                    "`useCount` INTEGER NOT NULL, `lastUsedAtMillis` INTEGER NOT NULL, " +
                    "PRIMARY KEY(`title`))",
            )
            old.execSQL(
                "INSERT INTO open_tasks VALUES ('task-1', 'water plants', 1000, 60, 15, 5000, 5000, 0, 1)",
            )
            old.execSQL("INSERT INTO title_history VALUES ('water plants', 3, 1000)")
            old.version = 3
        }

        val db = Room.databaseBuilder(context, BadgerDb::class.java, "migration-test-v3.db")
            .addMigrations(
                BadgerDb.MIGRATION_2_3, BadgerDb.MIGRATION_3_4,
                BadgerDb.MIGRATION_4_5, BadgerDb.MIGRATION_5_6,
                BadgerDb.MIGRATION_6_7,
            )
            .allowMainThreadQueries()
            .build()
        try {
            runBlocking {
                val task = db.openTaskDao().getAll().single()
                assertEquals("task-1", task.id)
                assertEquals("water plants", task.title)
                assertEquals(5000L, task.firstWarningAtMillis)
                assertEquals(true, task.pendingCreate)
                assertNull("migrated rows are not recurring", task.recurEveryN)
                assertNull(task.recurUnit)
                assertNull(task.recurDaysOfWeek)
                assertNull(task.seriesId)
                assertFalse("migrated rows have no pending edits", task.pendingUpdate)

                assertEquals(listOf("water plants"), db.titleHistoryDao().getRanked())
            }
        } finally {
            db.close()
        }
    }

    @Test
    fun `existing v4 data survives the migration to v5`() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        val dbFile = context.getDatabasePath("migration-test-v4.db")
        dbFile.parentFile?.mkdirs()
        dbFile.delete()

        // The exact schema Room generated for version 4 (pre completed_tasks),
        // with a task an existing install would have.
        SQLiteDatabase.openOrCreateDatabase(dbFile, null).use { old ->
            old.execSQL(
                "CREATE TABLE IF NOT EXISTS `open_tasks` (`id` TEXT NOT NULL, " +
                    "`title` TEXT NOT NULL, `createdAtMillis` INTEGER NOT NULL, " +
                    "`initialDelayMinutes` INTEGER NOT NULL, `repeatIntervalMinutes` INTEGER NOT NULL, " +
                    "`firstWarningAtMillis` INTEGER, `nextFireAtMillis` INTEGER NOT NULL, " +
                    "`recurEveryN` INTEGER, `recurUnit` TEXT, `recurDaysOfWeek` INTEGER, " +
                    "`seriesId` TEXT, `pendingDone` INTEGER NOT NULL, `pendingCreate` INTEGER NOT NULL, " +
                    "`pendingUpdate` INTEGER NOT NULL, PRIMARY KEY(`id`))",
            )
            old.execSQL(
                "CREATE TABLE IF NOT EXISTS `title_history` (`title` TEXT NOT NULL, " +
                    "`useCount` INTEGER NOT NULL, `lastUsedAtMillis` INTEGER NOT NULL, " +
                    "PRIMARY KEY(`title`))",
            )
            old.execSQL(
                "INSERT INTO open_tasks VALUES ('task-1', 'water plants', 1000, 60, 15, " +
                    "5000, 5000, 1, 'days', NULL, 'task-1', 0, 0, 0)",
            )
            old.version = 4
        }

        val db = Room.databaseBuilder(context, BadgerDb::class.java, "migration-test-v4.db")
            .addMigrations(
                BadgerDb.MIGRATION_2_3, BadgerDb.MIGRATION_3_4,
                BadgerDb.MIGRATION_4_5, BadgerDb.MIGRATION_5_6,
                BadgerDb.MIGRATION_6_7,
            )
            .allowMainThreadQueries()
            .build()
        try {
            runBlocking {
                val task = db.openTaskDao().getAll().single()
                assertEquals("task-1", task.id)
                assertEquals("water plants", task.title)
                assertEquals(1, task.recurEveryN)
                assertEquals("task-1", task.seriesId)

                val dao = db.completedTaskDao()
                dao.upsert(CompletedTaskEntity("done-1", "walk dog", 9000L, null))
                assertEquals(
                    listOf("walk dog"),
                    dao.observeBetween(0L, 10_000L).first().map { it.title },
                )
            }
        } finally {
            db.close()
        }
    }

    @Test
    fun `existing v5 completions survive the migration to v6 as not cancelled`() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        val dbFile = context.getDatabasePath("migration-test-v5.db")
        dbFile.parentFile?.mkdirs()
        dbFile.delete()

        // The exact schema Room generated for version 5 (pre cancelled), with a
        // completion an existing install would already have cached.
        SQLiteDatabase.openOrCreateDatabase(dbFile, null).use { old ->
            old.execSQL(
                "CREATE TABLE IF NOT EXISTS `open_tasks` (`id` TEXT NOT NULL, " +
                    "`title` TEXT NOT NULL, `createdAtMillis` INTEGER NOT NULL, " +
                    "`initialDelayMinutes` INTEGER NOT NULL, `repeatIntervalMinutes` INTEGER NOT NULL, " +
                    "`firstWarningAtMillis` INTEGER, `nextFireAtMillis` INTEGER NOT NULL, " +
                    "`recurEveryN` INTEGER, `recurUnit` TEXT, `recurDaysOfWeek` INTEGER, " +
                    "`seriesId` TEXT, `pendingDone` INTEGER NOT NULL, `pendingCreate` INTEGER NOT NULL, " +
                    "`pendingUpdate` INTEGER NOT NULL, PRIMARY KEY(`id`))",
            )
            old.execSQL(
                "CREATE TABLE IF NOT EXISTS `title_history` (`title` TEXT NOT NULL, " +
                    "`useCount` INTEGER NOT NULL, `lastUsedAtMillis` INTEGER NOT NULL, " +
                    "PRIMARY KEY(`title`))",
            )
            old.execSQL(
                "CREATE TABLE IF NOT EXISTS `completed_tasks` (`id` TEXT NOT NULL, " +
                    "`title` TEXT NOT NULL, `completedAtMillis` INTEGER NOT NULL, " +
                    "`seriesId` TEXT, PRIMARY KEY(`id`))",
            )
            old.execSQL(
                "CREATE INDEX IF NOT EXISTS `index_completed_tasks_completedAtMillis` " +
                    "ON `completed_tasks` (`completedAtMillis`)",
            )
            old.execSQL("INSERT INTO completed_tasks VALUES ('done-1', 'walk dog', 9000, NULL)")
            old.version = 5
        }

        val db = Room.databaseBuilder(context, BadgerDb::class.java, "migration-test-v5.db")
            .addMigrations(
                BadgerDb.MIGRATION_2_3, BadgerDb.MIGRATION_3_4,
                BadgerDb.MIGRATION_4_5, BadgerDb.MIGRATION_5_6,
                BadgerDb.MIGRATION_6_7,
            )
            .allowMainThreadQueries()
            .build()
        try {
            runBlocking {
                val done = db.completedTaskDao().observeBetween(0L, 10_000L).first().single()
                assertEquals("walk dog", done.title)
                assertEquals(9000L, done.completedAtMillis)
                assertFalse("history from before cancelling existed was done", done.cancelled)
            }
        } finally {
            db.close()
        }
    }

    @Test
    fun `existing v6 title history survives the migration to v7 as not dismissed`() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        val dbFile = context.getDatabasePath("migration-test-v6.db")
        dbFile.parentFile?.mkdirs()
        dbFile.delete()

        // The exact schema Room generated for version 6 (pre dismissed), with a
        // learned title an existing install would already be suggesting.
        SQLiteDatabase.openOrCreateDatabase(dbFile, null).use { old ->
            old.execSQL(
                "CREATE TABLE IF NOT EXISTS `open_tasks` (`id` TEXT NOT NULL, " +
                    "`title` TEXT NOT NULL, `createdAtMillis` INTEGER NOT NULL, " +
                    "`initialDelayMinutes` INTEGER NOT NULL, `repeatIntervalMinutes` INTEGER NOT NULL, " +
                    "`firstWarningAtMillis` INTEGER, `nextFireAtMillis` INTEGER NOT NULL, " +
                    "`recurEveryN` INTEGER, `recurUnit` TEXT, `recurDaysOfWeek` INTEGER, " +
                    "`seriesId` TEXT, `pendingDone` INTEGER NOT NULL, `pendingCreate` INTEGER NOT NULL, " +
                    "`pendingUpdate` INTEGER NOT NULL, PRIMARY KEY(`id`))",
            )
            old.execSQL(
                "CREATE TABLE IF NOT EXISTS `title_history` (`title` TEXT NOT NULL, " +
                    "`useCount` INTEGER NOT NULL, `lastUsedAtMillis` INTEGER NOT NULL, " +
                    "PRIMARY KEY(`title`))",
            )
            old.execSQL(
                "CREATE TABLE IF NOT EXISTS `completed_tasks` (`id` TEXT NOT NULL, " +
                    "`title` TEXT NOT NULL, `completedAtMillis` INTEGER NOT NULL, " +
                    "`seriesId` TEXT, `cancelled` INTEGER NOT NULL, PRIMARY KEY(`id`))",
            )
            old.execSQL(
                "CREATE INDEX IF NOT EXISTS `index_completed_tasks_completedAtMillis` " +
                    "ON `completed_tasks` (`completedAtMillis`)",
            )
            old.execSQL("INSERT INTO title_history VALUES ('water plants', 3, 1000)")
            old.version = 6
        }

        val db = Room.databaseBuilder(context, BadgerDb::class.java, "migration-test-v6.db")
            .addMigrations(
                BadgerDb.MIGRATION_2_3, BadgerDb.MIGRATION_3_4,
                BadgerDb.MIGRATION_4_5, BadgerDb.MIGRATION_5_6,
                BadgerDb.MIGRATION_6_7,
            )
            .allowMainThreadQueries()
            .build()
        try {
            runBlocking {
                val dao = db.titleHistoryDao()
                assertEquals(listOf("water plants"), dao.getRanked())
                assertFalse("nothing was dismissed before v7", dao.getByTitle("water plants")!!.dismissed)

                dao.dismiss("water plants")
                assertEquals(emptyList<String>(), dao.getRanked())
            }
        } finally {
            db.close()
        }
    }
}
