import type { Rect, Span } from "@/lib/types"

/** Rects covering characters [start, end) of a span, one per segment touched. */
export function rangeRects(span: Span, start: number, end: number): Rect[] {
  const rects: Rect[] = []
  for (const seg of span.segments) {
    const segEnd = seg.start + seg.text.length
    const a = Math.max(start, seg.start)
    const b = Math.min(end, segEnd)
    if (a >= b) continue
    // Proportional by character count: good enough for a highlighter.
    const len = seg.text.length
    const x0 = seg.rect.x + (seg.rect.w * (a - seg.start)) / len
    const x1 = seg.rect.x + (seg.rect.w * (b - seg.start)) / len
    rects.push({ x: x0, y: seg.rect.y, w: x1 - x0, h: seg.rect.h })
  }
  return rects
}

/** Whole-line rects, merging segments into one bar per line. */
export function spanRects(span: Span): Rect[] {
  const rects = rangeRects(span, 0, span.text.length)
  if (rects.length === 0) return rects
  const x = Math.min(...rects.map((r) => r.x))
  const y = Math.min(...rects.map((r) => r.y))
  const right = Math.max(...rects.map((r) => r.x + r.w))
  const bottom = Math.max(...rects.map((r) => r.y + r.h))
  return [{ x, y, w: right - x, h: bottom - y }]
}
