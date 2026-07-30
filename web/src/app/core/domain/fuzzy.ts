/**
 * fzf-style fuzzy matching: the query must appear in the candidate as a
 * subsequence (case-insensitive). Like fzf v2, a small dynamic program finds
 * the best-scoring alignment, favoring word-boundary hits and consecutive
 * runs, so "totr" ranks "take out trash" highly.
 */

const NO_MATCH = -Number.MAX_SAFE_INTEGER / 2;
const BOUNDARY_BONUS = 8;
const CONSECUTIVE_BONUS = 4;

const LETTER_OR_DIGIT = /[\p{L}\p{Nd}]/u;

export function score(query: string, candidate: string): number | null {
  if (query.trim() === '') return 0;
  const q = query.toLowerCase();
  const c = candidate.toLowerCase();
  if (q.length > c.length) return null;

  // prev[j] = best score matching the query up to the previous char, with that
  // char matched exactly at candidate position j.
  let prev = new Array<number>(c.length).fill(NO_MATCH);
  for (let qi = 0; qi < q.length; qi++) {
    const cur = new Array<number>(c.length).fill(NO_MATCH);
    for (let j = qi; j < c.length; j++) {
      if (c[j] !== q[qi]) continue;
      const base = 1 + (j === 0 || !LETTER_OR_DIGIT.test(c[j - 1]) ? BOUNDARY_BONUS : 0);
      if (qi === 0) {
        cur[j] = base;
        continue;
      }
      let best = NO_MATCH;
      for (let k = qi - 1; k < j; k++) {
        if (prev[k] === NO_MATCH) continue;
        const transition = k === j - 1 ? CONSECUTIVE_BONUS : -(j - k - 1); // gap penalty
        if (prev[k] + transition > best) best = prev[k] + transition;
      }
      if (best !== NO_MATCH) cur[j] = base + best;
    }
    prev = cur;
  }
  const result = prev.length === 0 ? NO_MATCH : Math.max(...prev);
  return result === NO_MATCH ? null : result;
}

/**
 * Ranks candidates by score, then by length (shorter wins), preserving the
 * input order (frequency/recency from the server) as the final tiebreak.
 */
export function rank(query: string, candidates: readonly string[], limit = 8): string[] {
  return candidates
    .map((candidate) => ({ candidate, score: score(query, candidate) }))
    .filter((it): it is { candidate: string; score: number } => it.score !== null)
    .sort((a, b) => b.score - a.score || a.candidate.length - b.candidate.length)
    .slice(0, limit)
    .map((it) => it.candidate);
}
