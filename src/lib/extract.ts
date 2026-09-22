import type { PDFDocumentProxy } from "pdfjs-dist"
import type { TextItem } from "pdfjs-dist/types/src/display/api"

import { cacheGet, cacheSet } from "@/lib/cache"
import type { Extraction, PageText, Rect, Segment, Span } from "@/lib/types"

/** Bump when the extraction shape or line-grouping rules change. */
const EXTRACTION_VERSION = 1

type Placed = { text: string; rect: Rect; baseline: number; size: number }

/**
 * Local text extraction, cached by file hash. Only this text (never the PDF
 * bytes) is ever sent to Jev.
 */
export async function extractDocument(
  pdf: PDFDocumentProxy,
  hash: string,
  onProgress?: (done: number, total: number) => void
): Promise<Extraction> {
  const key = `extract:${hash}`
  const cached = await cacheGet<Extraction>(key)
  if (cached?.version === EXTRACTION_VERSION) return cached

  const pages: PageText[] = []
  for (let n = 1; n <= pdf.numPages; n++) {
    pages.push(await extractPage(pdf, n))
    onProgress?.(n, pdf.numPages)
  }
  const extraction: Extraction = {
    version: EXTRACTION_VERSION,
    hash,
    pageCount: pdf.numPages,
    pages,
    emptyPages: pages.filter((p) => p.spans.length === 0).map((p) => p.page),
  }
  await cacheSet(key, extraction)
  return extraction
}

async function extractPage(
  pdf: PDFDocumentProxy,
  pageNumber: number
): Promise<PageText> {
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()

  const placed: Placed[] = []
  for (const item of content.items) {
    if (!("str" in item) || item.str.length === 0) continue
    const rect = itemRect(item, viewport)
    if (rect) placed.push({ text: item.str, ...rect })
  }
  page.cleanup()

  return {
    page: pageNumber,
    width: viewport.width,
    height: viewport.height,
    spans: groupLines(placed, pageNumber),
  }
}

function itemRect(
  item: TextItem,
  viewport: { convertToViewportPoint(x: number, y: number): number[] }
): { rect: Rect; baseline: number; size: number } | null {
  const [, , c, d, e, f] = item.transform as number[]
  const size = Math.hypot(c, d) || item.height
  if (!size || !item.width) return null
  // Box in PDF user space: baseline origin, rough ascent/descent.
  const corners = [
    viewport.convertToViewportPoint(e, f - size * 0.22),
    viewport.convertToViewportPoint(e + item.width, f + size * 0.9),
  ]
  const xs = corners.map((p) => p[0])
  const ys = corners.map((p) => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return {
    rect: { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y },
    baseline: viewport.convertToViewportPoint(e, f)[1],
    size: Math.abs(ys[1] - ys[0]) / 1.12,
  }
}

/** Group text runs that share a baseline into visual lines, top to bottom. */
function groupLines(items: Placed[], page: number): Span[] {
  const lines: Placed[][] = []
  for (const item of items) {
    const line = lines.find(
      (l) =>
        Math.abs(l[0].baseline - item.baseline) <
        Math.min(l[0].size, item.size) * 0.45
    )
    if (line) line.push(item)
    else lines.push([item])
  }

  lines.sort((a, b) => a[0].baseline - b[0].baseline)

  const spans: Span[] = []
  for (const line of lines) {
    line.sort((a, b) => a.rect.x - b.rect.x)
    let text = ""
    const segments: Segment[] = []
    let prev: Placed | null = null
    for (const item of line) {
      if (prev) {
        const gap = item.rect.x - (prev.rect.x + prev.rect.w)
        const needsSpace =
          gap > item.size * 0.12 && !/\s$/.test(text) && !/^\s/.test(item.text)
        if (needsSpace) text += " "
      }
      segments.push({ start: text.length, text: item.text, rect: item.rect })
      text += item.text
      prev = item
    }
    // Collapse whitespace-only lines; keep offsets intact for real ones.
    if (text.trim().length === 0) continue
    spans.push({
      id: `p${page}-l${spans.length}`,
      page,
      index: spans.length,
      text,
      segments,
    })
  }
  return spans
}
