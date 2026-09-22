/** Rect in page CSS pixels at scale 1, top-left origin. */
export type Rect = { x: number; y: number; w: number; h: number }

/** A run of text drawn in one go; `start` is its offset within the span's text. */
export type Segment = {
  start: number
  text: string
  rect: Rect
  /** CSS font family pdf.js reports for this run ("serif", "sans-serif", …). */
  font?: string
}

/** One visual line of text on a page. This is the unit Jev judges. */
export type Span = {
  id: string
  /** 1-based page number on the original PDF. */
  page: number
  /** Index of this line within its page. */
  index: number
  text: string
  segments: Segment[]
}

export type PageText = {
  page: number
  width: number
  height: number
  spans: Span[]
}

export type Extraction = {
  version: number
  hash: string
  pageCount: number
  pages: PageText[]
  /** 1-based pages with no text layer (likely scanned). */
  emptyPages: number[]
}

export type SearchMode = "meaning" | "exact"

/** A highlight to paint: one or more rects on one page. */
export type Highlight = { page: number; rects: Rect[] }

export type Result = {
  id: string
  page: number
  /** 0..1; noul for meaning, 1 for exact. */
  score: number
  text: string
  highlight: Highlight
}
