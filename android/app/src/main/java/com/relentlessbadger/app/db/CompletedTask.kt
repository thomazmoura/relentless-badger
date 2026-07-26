package com.relentlessbadger.app.db

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

/**
 * Completion history cache, so the calendar works offline. Rows are written
 * the moment a task is completed on this device (with the local clock's
 * timestamp) and reconciled from the server's done list during sync — the id
 * is the task id, shared with open_tasks, so both paths dedupe naturally.
 *
 * A cancelled row was closed without being done — kept for the record, but left
 * out of the calendar's history unless the user asks to see cancellations.
 */
@Entity(
    tableName = "completed_tasks",
    indices = [Index("completedAtMillis")],
)
data class CompletedTaskEntity(
    @PrimaryKey val id: String,
    val title: String,
    val completedAtMillis: Long,
    val seriesId: String? = null,
    val cancelled: Boolean = false,
)

@Dao
interface CompletedTaskDao {
    @Query(
        "SELECT * FROM completed_tasks " +
            "WHERE completedAtMillis >= :fromMillis AND completedAtMillis < :toMillis " +
            "ORDER BY completedAtMillis ASC, id ASC",
    )
    fun observeBetween(fromMillis: Long, toMillis: Long): Flow<List<CompletedTaskEntity>>

    @Query("SELECT * FROM completed_tasks WHERE id = :id")
    suspend fun getById(id: String): CompletedTaskEntity?

    @Upsert
    suspend fun upsert(entry: CompletedTaskEntity)

    /**
     * Sync pull: existing rows win, so an offline completion's true local
     * timestamp is never overwritten by the server's later push-time stamp.
     * Completions made on other devices don't exist locally and insert normally.
     */
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertIgnoring(entries: List<CompletedTaskEntity>)

    @Query("DELETE FROM completed_tasks")
    suspend fun clear()
}
