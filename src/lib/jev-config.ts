/**
 * Every Jev knob lives here: the question we ask, the threshold we trust,
 * and the budgets we stay under. Tune in one place.
 */

export const JEV_MODEL = "jev-latest"

/** A span is a hit when Jev's noul (P(yes)) is at or above this. */
export const HIT_THRESHOLD = 0.55

/**
 * TypeSafe limits (docs.typesafe.ai/models): 64k tokens per request total,
 * 32k for state + the longest question. We stay well under both, using a
 * deliberately pessimistic chars→tokens estimate.
 */
export const REQUEST_TOKEN_LIMIT = 64_000
export const STATE_PLUS_QUESTION_TOKEN_LIMIT = 32_000
export const CHARS_PER_TOKEN = 3
/** Target size for one batch's state (the page lines Jev reads as context). */
export const BATCH_STATE_TOKEN_BUDGET = 6_000
/** Max span questions per request; all share one state and run in parallel. */
export const MAX_QUESTIONS_PER_BATCH = 16

/** Requests in flight at once (rate limit is 1,200 req/min). */
export const MAX_CONCURRENT_REQUESTS = 6

/** Backoff for 429 / 529 / network blips. */
export const RETRY_MAX_ATTEMPTS = 6
export const RETRY_BASE_DELAY_MS = 500
export const RETRY_MAX_DELAY_MS = 15_000

/** Lines shorter than this with no letters (page numbers, lone "$") aren't asked about. */
export const MIN_SPAN_CHARS = 4

export function estimateTokens(value: unknown): number {
  const text = typeof value === "string" ? value : JSON.stringify(value)
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/**
 * One narrow question per span. The span's own text rides in the question,
 * so each question is self-contained; `page_text` in the state is shared
 * context. (Pointing at `lines[i]` by index smeared nouls onto neighbours.)
 */
export function spanQuestion(line: string) {
  return {
    type: "noul" as const,
    instructions: {
      task: "Does the quoted line itself contain information that answers the search in `query`? `page_text` is the surrounding page, for context only (column headings, the sentence the line continues). Judge only the quoted line.",
      line,
    },
    criteria: {
      true: "The quoted line states the fact, figure, or explanation the searcher is looking for, including a table row whose label and value answer it.",
      false: "The quoted line is unrelated, only on a related topic, or is a heading or neighbour of the line that actually answers.",
    },
  }
}

/** Bump when spanQuestion's wording changes so cached nouls are not reused. */
export const QUESTION_VERSION = 2

/** When nothing clears HIT_THRESHOLD, offer up to this many lines above the floor. */
export const NEAR_MISS_FLOOR = 0.3
export const NEAR_MISS_LIMIT = 3
