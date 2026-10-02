package com.relentlessbadger.app.db

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Transaction
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
 *
 * [pendingRetime] marks a completion whose moment the user moved after it had
 * already reached the server. It lives here rather than on the open row because
 * that row is deleted once the completion is pushed.
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
    val pendingRetime: Boolean = false,
)

@Dao
interface CompletedTaskDao {
    @Query(
        "SELECT * FROM completed_tasks " +
            "WHERE completedAtMillis >= :fromMillis AND completedAtMillis < :toMillis " +
            "ORDER BY completedAtMillis ASC, id ASC",
    )
    fun observeBetween(fromMillis: Long, toMillis: Long): Flow<List<CompletedTaskEntity>>

    @Query(
        "SELECT * FROM completed_tasks " +
            "WHERE completedAtMillis >= :fromMillis AND completedAtMillis < :toMillis " +
            "ORDER BY completedAtMillis ASC, id ASC",
    )
    suspend fun getBetween(fromMillis: Long, toMillis: Long): List<CompletedTaskEntity>

    @Query("SELECT * FROM completed_tasks WHERE pendingRetime = 1")
    suspend fun getPendingRetime(): List<CompletedTaskEntity>

    @Query("UPDATE completed_tasks SET pendingRetime = 0 WHERE id = :id AND completedAtMillis = :atMillis")
    suspend fun clearPendingRetime(id: String, atMillis: Long)

    @Query("SELECT * FROM completed_tasks WHERE id = :id")
    suspend fun getById(id: String): CompletedTaskEntity?

    @Upsert
    suspend fun upsert(entry: CompletedTaskEntity)

    @Upsert
    suspend fun upsertAll(entries: List<CompletedTaskEntity>)

    /**
     * Sync pull: the server's copy replaces the cached one — which is how a
     * completion moved on another device reaches this one — except where this
     * device moved it and the move hasn't been pushed. Checked in the same
     * transaction as the write, so a move made mid-sync isn't overwritten.
     */
    @Transaction
    suspend fun adoptFromServer(entries: List<CompletedTaskEntity>) {
        val retiming = getPendingRetime().map { it.id }.toSet()
        upsertAll(entries.filter { it.id !in retiming })
    }

    /** Undoing a conclusion: the task was never closed, so the calendar forgets it. */
    @Query("DELETE FROM completed_tasks WHERE id = :id")
    suspend fun delete(id: String)

    @Query("DELETE FROM completed_tasks")
    suspend fun clear()
}
