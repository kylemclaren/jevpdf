import type { Rect, Span } from "@/lib/types"

/** Rects covering characters [start, end) of a span, one per segment touched. */
export function rangeRects(span: Span, start: number, end: number): Rect[] {
  const rects: Rect[] = []
  for (const seg of span.segments) {
    const segEnd = seg.start + seg.text.length
    const a = Math.max(start, seg.start)
    const b = Math.min(end, segEnd)
    if (a >= b) continue
    const x0 = seg.rect.x + seg.rect.w * fraction(seg, a - seg.start)
    const x1 = seg.rect.x + seg.rect.w * fraction(seg, b - seg.start)
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

let ctx: CanvasRenderingContext2D | null | undefined

/**
 * How far into a run `chars` characters reach, as a fraction of its width.
 * Measured with canvas in the run's font family so proportional glyphs land
 * right; falls back to character count without a canvas.
 */
function fraction(seg: Span["segments"][number], chars: number): number {
  if (chars <= 0) return 0
  if (chars >= seg.text.length) return 1
  if (ctx === undefined) {
    ctx =
      typeof document === "undefined"
        ? null
        : document.createElement("canvas").getContext("2d")
  }
  if (ctx) {
    ctx.font = `100px ${seg.font ?? "sans-serif"}`
    const total = ctx.measureText(seg.text).width
    if (total > 0) return ctx.measureText(seg.text.slice(0, chars)).width / total
  }
  return chars / seg.text.length
}
