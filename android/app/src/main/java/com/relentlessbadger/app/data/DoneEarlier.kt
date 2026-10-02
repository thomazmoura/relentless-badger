package com.relentlessbadger.app.data

import com.relentlessbadger.app.db.CompletedTaskEntity
import com.relentlessbadger.app.db.OpenTaskEntity

/**
 * How far either side of the picked moment an existing completion still counts
 * as "recent" — wide enough to catch last night's work being re-dated the next
 * morning, narrow enough that the list stays a short checklist.
 */
const val DONE_EARLIER_WINDOW_MILLIS = 48 * 60 * 60_000L

/**
 * What [TaskRepository.doneEarlierCandidates] offers for marking done at one
 * earlier moment: open tasks that already existed then, and recent completions
 * whose moment can be moved to it.
 */
data class DoneEarlierCandidates(
    val open: List<OpenTaskEntity>,
    val completed: List<CompletedTaskEntity>,
)

/**
 * Receipt for [TaskRepository.completeTasksAt], given to
 * [TaskRepository.undoBatchConclusion] to reverse it. [retimed] holds each
 * moved completion as it was before, so the undo can put it back.
 */
data class BatchConclusion(
    val concluded: List<ConcludedTask>,
    val retimed: List<CompletedTaskEntity>,
) {
    val count get() = concluded.size + retimed.size
}
