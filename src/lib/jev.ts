import { cacheGet, cacheSet } from "@/lib/cache"
import { EXTRACTION_VERSION } from "@/lib/extract"
import {
  BATCH_STATE_TOKEN_BUDGET,
  CHARS_PER_TOKEN,
  estimateTokens,
  JEV_MODEL,
  MAX_CONCURRENT_REQUESTS,
  MAX_QUESTIONS_PER_BATCH,
  MIN_SPAN_CHARS,
  QUESTION_VERSION,
  REQUEST_TOKEN_LIMIT,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_ATTEMPTS,
  RETRY_MAX_DELAY_MS,
  spanQuestion,
  STATE_PLUS_QUESTION_TOKEN_LIMIT,
} from "@/lib/jev-config"
import type { Extraction, Span } from "@/lib/types"

/** One request: a window of page lines as context, some of them asked about. */
export type Batch = {
  page: number
  /** Context lines, in page order. */
  lines: Span[]
  /** Indexes into `lines` that get a noul question. */
  ask: number[]
}

export type Nouls = Record<string, number>

export class JevFatalError extends Error {}

/** Spans worth asking about: skip page numbers, lone symbols, etc. */
export function isCandidate(span: Span) {
  const t = span.text.trim()
  return t.length >= MIN_SPAN_CHARS || /[a-z]/i.test(t)
}

export function candidateCount(extraction: Extraction) {
  return extraction.pages.reduce(
    (n, p) => n + p.spans.filter(isCandidate).length,
    0
  )
}

/**
 * Split each page into windows whose text fits the state budget, then split
 * each window's questions into groups. Never crosses a page boundary, so
 * page numbers stay exact.
 */
export function planBatches(extraction: Extraction, skip: Set<string>): Batch[] {
  const maxLineChars = BATCH_STATE_TOKEN_BUDGET * CHARS_PER_TOKEN
  const batches: Batch[] = []
  for (const page of extraction.pages) {
    let window: Span[] = []
    let windowChars = 0
    const flush = () => {
      const ask = window
        .map((s, i) => (isCandidate(s) && !skip.has(s.id) ? i : -1))
        .filter((i) => i >= 0)
      for (let k = 0; k < ask.length; k += MAX_QUESTIONS_PER_BATCH) {
        batches.push({
          page: page.page,
          lines: window,
          ask: ask.slice(k, k + MAX_QUESTIONS_PER_BATCH),
        })
      }
      window = []
      windowChars = 0
    }
    for (const span of page.spans) {
      const len = Math.min(span.text.length, maxLineChars) + 8
      if (window.length > 0 && windowChars + len > maxLineChars) flush()
      window.push(span)
      windowChars += len
    }
    if (window.length > 0) flush()
  }
  return batches
}

export function buildRequest(batch: Batch, query: string) {
  const maxLineChars = BATCH_STATE_TOKEN_BUDGET * CHARS_PER_TOKEN
  const state = {
    query,
    page: batch.page,
    page_text: batch.lines
      .map((s) => s.text.trim().slice(0, maxLineChars))
      .join("\n"),
  }
  const questions = Object.fromEntries(
    batch.ask.map((i) => [
      `line_${i}`,
      spanQuestion(batch.lines[i].text.trim().slice(0, maxLineChars)),
    ])
  )

  // Guard the documented limits (64k total, 32k state + longest question).
  const stateTokens = estimateTokens(state)
  const questionTokens = Object.values(questions).map(estimateTokens)
  const longest = Math.max(0, ...questionTokens)
  const total = stateTokens + questionTokens.reduce((a, b) => a + b, 0)
  if (
    stateTokens + longest > STATE_PLUS_QUESTION_TOKEN_LIMIT ||
    total > REQUEST_TOKEN_LIMIT
  ) {
    throw new Error(`Batch for page ${batch.page} exceeds token limits`)
  }

  return { model: JEV_MODEL, state, questions }
}

type NoulResponse = {
  answers: Record<string, { type: "noul"; noul: number }>
  usage?: { input_tokens: number; output_tokens: number }
}

/** What TypeSafe reported for one request (output tokens are free). */
export type BatchMeta = { inputTokens: number }

export type JevEvents = {
  onBatch: (nouls: Nouls, batch: Batch, meta: BatchMeta) => void
  onBatchStart?: (batch: Batch) => void
  onRetry?: (status: number, delayMs: number) => void
  onBatchError?: (batch: Batch, error: unknown) => void
}

function cacheKey(hash: string, query: string) {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ")
  return `jev:${hash}:x${EXTRACTION_VERSION}:${JEV_MODEL}:q${QUESTION_VERSION}:${q}`
}

/**
 * Ask Jev about every candidate span, a batch at a time, streaming results
 * through `onBatch`. Cached nouls for this (file, query) are returned first
 * and not re-asked. Rejects with AbortError if `signal` aborts.
 */
export async function runMeaningSearch(
  extraction: Extraction,
  query: string,
  signal: AbortSignal,
  events: JevEvents
): Promise<{ nouls: Nouls; failedBatches: number }> {
  const key = cacheKey(extraction.hash, query)
  const nouls: Nouls = { ...(await cacheGet<Nouls>(key)) }
  signal.throwIfAborted()

  const batches = planBatches(extraction, new Set(Object.keys(nouls)))
  let failedBatches = 0
  let next = 0
  let fatal: unknown = null

  const worker = async () => {
    while (next < batches.length && !signal.aborted && !fatal) {
      const batch = batches[next++]
      events.onBatchStart?.(batch)
      try {
        const res = await askBatch(batch, query, signal, events.onRetry)
        const meta: BatchMeta = { inputTokens: res.usage?.input_tokens ?? 0 }
        const got: Nouls = {}
        for (const i of batch.ask) {
          const answer = res.answers[`line_${i}`]
          if (answer) got[batch.lines[i].id] = answer.noul
        }
        Object.assign(nouls, got)
        void cacheSet(key, nouls)
        events.onBatch(got, batch, meta)
      } catch (err) {
        if (signal.aborted) return
        if (err instanceof JevFatalError) {
          fatal = err
          return
        }
        failedBatches++
        events.onBatchError?.(batch, err)
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENT_REQUESTS, batches.length) }, worker)
  )
  signal.throwIfAborted()
  if (fatal) throw fatal
  return { nouls, failedBatches }
}

async function askBatch(
  batch: Batch,
  query: string,
  signal: AbortSignal,
  onRetry?: (status: number, delayMs: number) => void
): Promise<NoulResponse> {
  const body = JSON.stringify(buildRequest(batch, query))
  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null
    try {
      res = await fetch("/api/jev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal,
      })
    } catch (err) {
      // TypeError = network failure: retry like a 5xx. Aborts propagate.
      if (signal.aborted || !(err instanceof TypeError)) throw err
    }
    const status = res?.status ?? 0
    if (res?.ok) return (await res.json()) as NoulResponse
    const retryAfter = res?.headers.get("retry-after") ?? null
    if (res) {
      const text = await res.text()
      if (status === 503 && text.includes("missing_api_key")) {
        throw new JevFatalError(
          "No TypeSafe key on the server. Add TYPESAFE_API_KEY to .env.local and restart."
        )
      }
      if (status === 401) {
        throw new JevFatalError("TypeSafe rejected the API key (401).")
      }
      if (![429, 529, 500, 502, 503, 504].includes(status)) {
        throw new Error(`TypeSafe ${status}: ${text.slice(0, 200)}`)
      }
    }
    if (attempt + 1 >= RETRY_MAX_ATTEMPTS) {
      throw new Error(`TypeSafe still busy after ${RETRY_MAX_ATTEMPTS} tries`)
    }
    const delay = backoff(attempt, retryAfter)
    onRetry?.(status, delay)
    await sleep(delay, signal)
  }
}

function backoff(attempt: number, retryAfter: string | null) {
  const hinted = retryAfter ? Number(retryAfter) * 1000 : NaN
  if (Number.isFinite(hinted) && hinted > 0) {
    return Math.min(hinted, RETRY_MAX_DELAY_MS)
  }
  const exp = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** attempt)
  return exp / 2 + Math.random() * (exp / 2)
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t)
        reject(signal.reason)
      },
      { once: true }
    )
  })
}
