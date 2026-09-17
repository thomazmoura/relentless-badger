package com.relentlessbadger.app.data

import com.relentlessbadger.app.db.OpenTaskEntity

/**
 * Receipt for a task that was just concluded, handed back by
 * [TaskRepository.completeTask] / [TaskRepository.cancelTask] and given to
 * [TaskRepository.undoConclusion] to reverse it.
 *
 * It carries the whole pre-close row rather than an id because the undo has to
 * survive the sync flush that deletes it — see [TaskRepository.undoConclusion].
 * The UI holds one of these for as long as its snackbar is up; nothing persists
 * it, since the offer to undo dies with the screen anyway.
 */
data class ConcludedTask(
    val task: OpenTaskEntity,
    val completedAtMillis: Long,
    val cancelled: Boolean,
    /** The next occurrence this conclusion spawned, if the task recurs. */
    val spawnedId: String? = null,
)
