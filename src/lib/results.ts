import { rangeRects, spanRects } from "@/lib/geometry"
import { HIT_THRESHOLD, NEAR_MISS_FLOOR, NEAR_MISS_LIMIT } from "@/lib/jev-config"
import type { Nouls } from "@/lib/jev"
import type { Extraction, PageText, Rect, Result, Span } from "@/lib/types"

/** Lines a highlight may run on past its hit to finish the sentence. */
const MAX_SENTENCE_TAIL_LINES = 2

/**
 * Turn per-line nouls into ranked results. Adjacent hit lines that read as
 * one wrapped sentence merge into one result scored by their best line;
 * table rows stay separate. A hit that stops mid-sentence is extended to the
 * sentence's end so the highlight reads as a whole thought.
 */
export function meaningResults(extraction: Extraction, nouls: Nouls): Result[] {
  const results: Result[] = []
  for (const page of extraction.pages) {
    let run: Span[] = []
    const flush = () => {
      if (run.length > 0) results.push(toResult(page, run, nouls))
      run = []
    }
    for (const span of page.spans) {
      const n = nouls[span.id]
      if (n !== undefined && n >= HIT_THRESHOLD) {
        const prev = run[run.length - 1]
        if (prev && !continues(prev, span)) flush()
        run.push(span)
      } else flush()
    }
    flush()
  }
  return rank(results)
}

/** The best lines below the hit threshold, for "nothing clearly answers". */
export function nearMisses(extraction: Extraction, nouls: Nouls): Result[] {
  const spans = extraction.pages.flatMap((p) => p.spans)
  const near = spans
    .filter((s) => {
      const n = nouls[s.id]
      return n !== undefined && n >= NEAR_MISS_FLOOR && n < HIT_THRESHOLD
    })
    .sort((a, b) => nouls[b.id] - nouls[a.id])
    .slice(0, NEAR_MISS_LIMIT)
  return near.map((s) => toResult(extraction.pages[s.page - 1], [s], nouls))
}

function toResult(page: PageText, run: Span[], nouls: Nouls): Result {
  const rects: Rect[] = run.flatMap(spanRects)
  const text = run.map((s) => s.text.trim())

  // Finish the sentence onto following lines, up to its full stop.
  let last = run[run.length - 1]
  for (let k = 0; k < MAX_SENTENCE_TAIL_LINES; k++) {
    const next = page.spans[last.index + 1]
    if (!next || !continues(last, next)) break
    const stop = next.text.search(/[.?!](\s|$)/)
    const end = stop >= 0 ? stop + 1 : next.text.length
    rects.push(...mergeLine(rangeRects(next, 0, end)))
    text.push(next.text.slice(0, end).trim())
    if (stop >= 0) break
    last = next
  }

  return {
    id: `meaning-${run[0].id}`,
    page: page.page,
    score: Math.max(...run.map((s) => nouls[s.id])),
    text: text.join(" "),
    highlight: { page: page.page, rects },
  }
}

function rank(results: Result[]) {
  // Rank by noul; ties keep document order.
  return results.sort((a, b) => b.score - a.score || a.page - b.page)
}

function mergeLine(rects: Rect[]): Rect[] {
  if (rects.length <= 1) return rects
  const x = Math.min(...rects.map((r) => r.x))
  const y = Math.min(...rects.map((r) => r.y))
  const right = Math.max(...rects.map((r) => r.x + r.w))
  const bottom = Math.max(...rects.map((r) => r.y + r.h))
  return [{ x, y, w: right - x, h: bottom - y }]
}

/**
 * Does `line`'s sentence wrap onto `next`? Wrapped prose has no terminal
 * punctuation and resumes in lowercase or mid-number (a date, a figure);
 * table rows and headings start with a capitalised label.
 */
function continues(line: Span, next: Span) {
  return (
    next.index === line.index + 1 &&
    !/[.?!:;]$/.test(line.text.trim()) &&
    /^[a-z0-9]/.test(next.text.trim())
  )
}
