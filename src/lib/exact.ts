import { rangeRects } from "@/lib/geometry"
import type { Extraction, Rect, Result } from "@/lib/types"

const MAX_EXACT_RESULTS = 500

/**
 * Local, case-insensitive, whitespace-tolerant match. Matches may cross line
 * breaks within a page.
 */
export function exactSearch(extraction: Extraction, query: string): Result[] {
  const needle = normalize(query)
  if (!needle) return []

  const results: Result[] = []
  for (const page of extraction.pages) {
    // Build a normalized page string with a map back to (span, offset).
    let hay = ""
    const map: { span: number; offset: number }[] = []
    page.spans.forEach((span, si) => {
      if (si > 0 && !hay.endsWith(" ")) {
        hay += " "
        map.push({ span: si, offset: -1 })
      }
      for (let i = 0; i < span.text.length; i++) {
        const ch = span.text[i]
        if (/\s/.test(ch)) {
          if (hay.endsWith(" ") || hay.length === 0) continue
          hay += " "
        } else {
          hay += ch.toLowerCase()
        }
        map.push({ span: si, offset: i })
      }
    })

    let from = 0
    for (;;) {
      const at = hay.indexOf(needle, from)
      if (at < 0) break
      from = at + needle.length

      // Collect the covered characters per span, then turn into rects.
      const bySpan = new Map<number, [number, number]>()
      for (let k = at; k < at + needle.length; k++) {
        const m = map[k]
        if (m.offset < 0) continue
        const r = bySpan.get(m.span)
        if (r) r[1] = m.offset + 1
        else bySpan.set(m.span, [m.offset, m.offset + 1])
      }
      const rects: Rect[] = []
      const texts: string[] = []
      for (const [si, [a, b]] of bySpan) {
        const span = page.spans[si]
        rects.push(...rangeRects(span, a, b))
        texts.push(span.text.trim())
      }
      results.push({
        id: `exact-${page.page}-${at}`,
        page: page.page,
        score: 1,
        text: texts.join(" "),
        highlight: { page: page.page, rects },
      })
      if (results.length >= MAX_EXACT_RESULTS) return results
    }
  }
  return results
}

function normalize(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim()
}
