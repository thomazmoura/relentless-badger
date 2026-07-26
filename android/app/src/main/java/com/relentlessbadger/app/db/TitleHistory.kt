package com.relentlessbadger.app.db

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert

/**
 * Every title ever used on this device (plus titles learned from the server),
 * so autocomplete works offline. Ranked by how often a title was used, with
 * recency breaking ties — mirroring what GET /tasks/titles returns.
 *
 * Titles the user removed from suggestions are kept as [dismissed] rows rather
 * than deleted: the row has to stay so the next sync doesn't learn the title
 * back from the server.
 */
@Entity(tableName = "title_history")
data class TitleHistoryEntity(
    @PrimaryKey val title: String,
    val useCount: Int,
    val lastUsedAtMillis: Long,
    val dismissed: Boolean = false,
)

@Dao
interface TitleHistoryDao {
    @Query(
        "SELECT title FROM title_history WHERE dismissed = 0 " +
            "ORDER BY useCount DESC, lastUsedAtMillis DESC LIMIT 500",
    )
    suspend fun getRanked(): List<String>

    @Query("SELECT * FROM title_history WHERE title = :title")
    suspend fun getByTitle(title: String): TitleHistoryEntity?

    @Upsert
    suspend fun upsert(entry: TitleHistoryEntity)

    @Query("UPDATE title_history SET dismissed = 1 WHERE title = :title")
    suspend fun dismiss(title: String)

    @Query("UPDATE title_history SET dismissed = 0 WHERE title = :title")
    suspend fun restore(title: String)

    @Transaction
    suspend fun recordUse(title: String, nowMillis: Long) {
        val existing = getByTitle(title)
        // Deliberately using a title again is the clearest sign the user wants
        // it suggested, so it also undoes an earlier dismissal.
        upsert(TitleHistoryEntity(title, (existing?.useCount ?: 0) + 1, nowMillis))
    }

    /**
     * Merges titles the server knows (e.g. from another device). Only unknown
     * titles are inserted, as single uses; local usage counts always win. The
     * staggered timestamps preserve the server's frequency ordering among them.
     */
    @Transaction
    suspend fun upsertFromServer(titles: List<String>, nowMillis: Long) {
        titles.forEachIndexed { index, title ->
            if (getByTitle(title) == null) {
                upsert(TitleHistoryEntity(title, 1, nowMillis - index))
            }
        }
    }

    @Query("DELETE FROM title_history")
    suspend fun clear()
}
