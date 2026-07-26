package com.relentlessbadger.app.db

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import androidx.room.Upsert
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import kotlinx.coroutines.flow.Flow

/**
 * Local copy of every open (not yet completed) task. This is the source of
 * truth the app runs off: tasks are created here first and the alarm
 * receivers read from here, so everything works offline and across reboots.
 * pendingCreate marks tasks created on-device that still need to reach the API;
 * pendingDone marks tasks completed on-device that still need to reach the API;
 * pendingUpdate marks schedule edits that still need to reach the API.
 *
 * A recurring task is an ordinary occurrence carrying its rule: recurEveryN
 * null means not recurring; recurUnit is "days" or "weeks"; recurDaysOfWeek is
 * a bitmask (bit 0 = Monday .. bit 6 = Sunday) used only for weeks. Completing
 * an occurrence spawns the next one as a new row sharing the seriesId.
 */
@Entity(tableName = "open_tasks")
data class OpenTaskEntity(
    @PrimaryKey val id: String,
    val title: String,
    val createdAtMillis: Long,
    val initialDelayMinutes: Int,
    val repeatIntervalMinutes: Int,
    val firstWarningAtMillis: Long? = null,
    val nextFireAtMillis: Long,
    val recurEveryN: Int? = null,
    val recurUnit: String? = null,
    val recurDaysOfWeek: Int? = null,
    val seriesId: String? = null,
    val pendingDone: Boolean = false,
    val pendingCreate: Boolean = false,
    val pendingUpdate: Boolean = false,
)

@Dao
interface OpenTaskDao {
    @Query("SELECT * FROM open_tasks WHERE pendingDone = 0 ORDER BY nextFireAtMillis ASC, createdAtMillis DESC")
    fun observeActive(): Flow<List<OpenTaskEntity>>

    @Query("SELECT * FROM open_tasks WHERE pendingDone = 0")
    suspend fun getActive(): List<OpenTaskEntity>

    @Query("SELECT * FROM open_tasks")
    suspend fun getAll(): List<OpenTaskEntity>

    @Query("SELECT * FROM open_tasks WHERE id = :id")
    suspend fun getById(id: String): OpenTaskEntity?

    @Query("SELECT * FROM open_tasks WHERE pendingDone = 1")
    suspend fun getPendingDone(): List<OpenTaskEntity>

    @Query("SELECT * FROM open_tasks WHERE pendingCreate = 1")
    suspend fun getPendingCreate(): List<OpenTaskEntity>

    // Rows still pendingCreate are excluded: the PUT would 404 on a server that
    // never saw the task. Creates are pushed (and the flag cleared) earlier in
    // the same sync, so an edited fresh task gets its update through right after.
    @Query("SELECT * FROM open_tasks WHERE pendingUpdate = 1 AND pendingCreate = 0 AND pendingDone = 0")
    suspend fun getPendingUpdate(): List<OpenTaskEntity>

    @Upsert
    suspend fun upsert(task: OpenTaskEntity)

    @Upsert
    suspend fun upsertAll(tasks: List<OpenTaskEntity>)

    @Query("UPDATE open_tasks SET pendingDone = 1 WHERE id = :id")
    suspend fun markPendingDone(id: String)

    @Query("UPDATE open_tasks SET pendingCreate = 0 WHERE id = :id")
    suspend fun clearPendingCreate(id: String)

    @Query("UPDATE open_tasks SET pendingUpdate = 0 WHERE id = :id")
    suspend fun clearPendingUpdate(id: String)

    @Query("DELETE FROM open_tasks WHERE id = :id")
    suspend fun delete(id: String)

    /**
     * Prunes tasks the server no longer lists as open. Rows with pending local
     * changes are kept: an unpushed create or completion must never be lost to
     * a pull that ran before the push could reach the server.
     */
    @Query("DELETE FROM open_tasks WHERE pendingDone = 0 AND pendingCreate = 0 AND id NOT IN (:ids)")
    suspend fun deleteSyncedNotIn(ids: List<String>)

    @Query("DELETE FROM open_tasks")
    suspend fun clear()
}

@Database(
    entities = [OpenTaskEntity::class, TitleHistoryEntity::class, CompletedTaskEntity::class],
    version = 6,
    exportSchema = true,
)
abstract class BadgerDb : RoomDatabase() {
    abstract fun openTaskDao(): OpenTaskDao
    abstract fun titleHistoryDao(): TitleHistoryDao
    abstract fun completedTaskDao(): CompletedTaskDao

    companion object {
        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE open_tasks ADD COLUMN pendingCreate INTEGER NOT NULL DEFAULT 0")
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `title_history` (" +
                        "`title` TEXT NOT NULL, " +
                        "`useCount` INTEGER NOT NULL, " +
                        "`lastUsedAtMillis` INTEGER NOT NULL, " +
                        "PRIMARY KEY(`title`))",
                )
            }
        }

        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE open_tasks ADD COLUMN recurEveryN INTEGER")
                db.execSQL("ALTER TABLE open_tasks ADD COLUMN recurUnit TEXT")
                db.execSQL("ALTER TABLE open_tasks ADD COLUMN recurDaysOfWeek INTEGER")
                db.execSQL("ALTER TABLE open_tasks ADD COLUMN seriesId TEXT")
                db.execSQL("ALTER TABLE open_tasks ADD COLUMN pendingUpdate INTEGER NOT NULL DEFAULT 0")
            }
        }

        val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `completed_tasks` (" +
                        "`id` TEXT NOT NULL, " +
                        "`title` TEXT NOT NULL, " +
                        "`completedAtMillis` INTEGER NOT NULL, " +
                        "`seriesId` TEXT, " +
                        "PRIMARY KEY(`id`))",
                )
                db.execSQL(
                    "CREATE INDEX IF NOT EXISTS `index_completed_tasks_completedAtMillis` " +
                        "ON `completed_tasks` (`completedAtMillis`)",
                )
            }
        }

        val MIGRATION_5_6 = object : Migration(5, 6) {
            override fun migrate(db: SupportSQLiteDatabase) {
                // Everything closed before cancelling existed was genuinely done.
                db.execSQL("ALTER TABLE completed_tasks ADD COLUMN cancelled INTEGER NOT NULL DEFAULT 0")
            }
        }
    }
}
