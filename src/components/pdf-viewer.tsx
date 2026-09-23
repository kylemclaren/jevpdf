import { memo, useEffect, useLayoutEffect, useRef, useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import "react-pdf/dist/Page/TextLayer.css"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { Ring } from "loading-dev"
import { cn } from "@/lib/utils"

import type { Extraction, PageText, Result } from "@/lib/types"

// Must be set in the same module that renders <Document>/<Page>.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString()

const PAGE_GAP = 20
const MAX_PAGE_WIDTH = 920

type Props = {
  file: File
  extraction: Extraction | null
  results: Result[]
  active: Result | null
  pulse: number
  busyPages: ReadonlySet<number>
  onSelect: (id: string) => void
  onLoaded: (pdf: PDFDocumentProxy) => void
  onError: (err: Error) => void
  className?: string
}

export function PdfViewer({
  file,
  extraction,
  results,
  active,
  pulse,
  busyPages,
  onSelect,
  onLoaded,
  onError,
  className,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef(new Map<number, HTMLDivElement>())
  const width = useWidth(scrollRef)
  const pageWidth = Math.max(0, Math.min(MAX_PAGE_WIDTH, width - 48))

  // Group highlights by page once per result change.
  const byPage = new Map<number, Result[]>()
  for (const r of results) {
    const list = byPage.get(r.page)
    if (list) list.push(r)
    else byPage.set(r.page, [r])
  }

  // Scroll the active highlight into view (and again on re-select).
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !active || !extraction || pageWidth === 0) return
    const pageEl = pageRefs.current.get(active.page)
    const page = extraction.pages[active.page - 1]
    if (!pageEl || !page) return
    const scale = pageWidth / page.width
    const topRect = Math.min(...active.highlight.rects.map((r) => r.y))
    el.scrollTo({
      top: pageEl.offsetTop + topRect * scale - el.clientHeight * 0.3,
      behavior: "smooth",
    })
  }, [active, pulse, extraction, pageWidth])

  return (
    <div
      ref={scrollRef}
      className={cn("relative overflow-y-auto overscroll-contain bg-desk", className)}
    >
      <Document
        file={file}
        onLoadSuccess={onLoaded}
        onLoadError={onError}
        loading={<Centered>Opening…</Centered>}
        error={<Centered>Couldn't open this PDF.</Centered>}
        className="flex flex-col items-center pt-6 pb-24"
      >
        {extraction && pageWidth > 0
          ? extraction.pages.map((page) => (
              <PdfPage
                key={page.page}
                page={page}
                width={pageWidth}
                results={byPage.get(page.page)}
                activeId={active?.page === page.page ? active.id : null}
                pulse={pulse}
                busy={busyPages.has(page.page)}
                onSelect={onSelect}
                refCallback={(el) => {
                  if (el) pageRefs.current.set(page.page, el)
                  else pageRefs.current.delete(page.page)
                }}
              />
            ))
          : null}
      </Document>
    </div>
  )
}

const PdfPage = memo(function PdfPage({
  page,
  width,
  results,
  activeId,
  pulse,
  busy,
  onSelect,
  refCallback,
}: {
  page: PageText
  width: number
  results: Result[] | undefined
  activeId: string | null
  pulse: number
  busy: boolean
  onSelect: (id: string) => void
  refCallback: (el: HTMLDivElement | null) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [seen, setSeen] = useState(false)
  const scale = width / page.width
  const height = page.height * scale

  // Only render pages near the viewport; keep them once rendered.
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const io = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setSeen(true),
      { rootMargin: "1200px 0px" }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [seen])

  return (
    <div
      ref={(el) => {
        ref.current = el
        refCallback(el)
      }}
      data-page={page.page}
      className="relative shrink-0 bg-white shadow-[0_1px_2px_oklch(0_0_0/0.06),0_8px_24px_-12px_oklch(0_0_0/0.18)]"
      style={{ width, height, marginBottom: PAGE_GAP }}
    >
      {seen ? (
        <Page
          pageNumber={page.page}
          width={width}
          renderAnnotationLayer={false}
          loading={<Centered><Ring size={18} /></Centered>}
        />
      ) : null}

      {/* Highlights multiply onto the page; a click on one selects its result. */}
      <div className="pointer-events-none absolute inset-0 z-[1] mix-blend-multiply">
        {results?.map((r) =>
          r.highlight.rects.map((rect, i) => (
            <div
              key={`${r.id}-${i}-${r.id === activeId ? pulse : 0}`}
              onClick={() => onSelect(r.id)}
              className={cn(
                "jev-mark pointer-events-auto absolute cursor-pointer rounded-[2px]",
                r.id === activeId ? "bg-mark-strong" : "bg-mark"
              )}
              data-active={r.id === activeId}
              style={{
                left: rect.x * scale - 2,
                top: rect.y * scale - 1,
                width: rect.w * scale + 4,
                height: rect.h * scale + 2,
                opacity: r.id === activeId ? 1 : 0.55 + 0.45 * r.score,
              }}
            />
          ))
        )}
      </div>

      {/* A quiet margin rule while Jev reads this page. */}
      <div
        aria-hidden
        className={cn(
          "absolute top-0 -left-3 h-full w-[2px] rounded-full bg-foreground/25 transition-opacity duration-500",
          busy ? "animate-pulse opacity-100" : "opacity-0"
        )}
      />
    </div>
  )
})

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-40 w-full items-center justify-center gap-2 text-sm text-muted-foreground">
      {children}
    </div>
  )
}

function useWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) =>
      setWidth(Math.round(entry.contentRect.width))
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}
