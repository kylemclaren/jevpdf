import { useRef, useState } from "react"
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "lucide-react"

import { PdfViewer } from "@/components/pdf-viewer"
import { SearchPanel } from "@/components/search-panel"
import { Button } from "@/components/ui/button"
import { useJevPdf } from "@/hooks/use-jev-pdf"
import { SAMPLE_FILE_NAME } from "@/lib/sample"
import { cn } from "@/lib/utils"

export function App() {
  const jev = useJevPdf()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  // iPhone-width: results first; "Show on page" slides the viewer in.
  const [mobileView, setMobileView] = useState<"results" | "page">("results")

  const pickFile = () => inputRef.current?.click()
  const openSample = async () => {
    const res = await fetch(`/sample/${SAMPLE_FILE_NAME}`)
    const blob = await res.blob()
    void jev.openFile(new File([blob], SAMPLE_FILE_NAME, { type: "application/pdf" }))
  }

  return (
    <div
      className="flex h-svh flex-col bg-background md:flex-row-reverse"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const f = e.dataTransfer.files[0]
        if (f) void jev.openFile(f)
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void jev.openFile(f)
          e.target.value = ""
        }}
      />

      <SearchPanel
        jev={jev}
        onPickFile={pickFile}
        onShowOnPage={(r) => {
          jev.select(r.id)
          setMobileView("page")
        }}
        className="min-h-0 flex-1 md:w-[380px] md:flex-none md:border-l lg:w-[420px]"
      />

      <main
        className={cn(
          "relative min-h-0 min-w-0 flex-1 flex-col bg-desk",
          mobileView === "page"
            ? "fixed inset-0 z-40 flex md:static"
            : "hidden md:flex"
        )}
      >
        <div className="flex items-center gap-2 border-b bg-background px-3 py-2 md:hidden">
          <Button variant="ghost" size="sm" onClick={() => setMobileView("results")}>
            <ArrowLeftIcon data-icon="inline-start" />
            Results
          </Button>
          <span className="truncate text-xs text-muted-foreground">
            {jev.active ? `Page ${jev.active.page}` : jev.file?.name}
          </span>
        </div>

        {jev.file ? (
          <PdfViewer
            file={jev.file}
            extraction={jev.extraction}
            results={jev.near.length ? jev.near : jev.results}
            active={jev.active}
            pulse={jev.pulse}
            busyPages={jev.busyPages}
            onSelect={jev.select}
            onLoaded={jev.onPdfLoaded}
            onError={jev.onPdfError}
            className="min-h-0 flex-1"
          />
        ) : (
          <EmptyState onPick={pickFile} onSample={openSample} />
        )}

        {jev.results.length > 0 && (
          <MatchNavigator
            index={jev.activeIndex}
            total={jev.results.length}
            page={jev.active?.page}
            onStep={jev.step}
          />
        )}
      </main>

      {/* On phones with no PDF yet, the empty state lives in the results column. */}
      {!jev.file && (
        <div className="border-t px-5 py-6 md:hidden">
          <EmptyState onPick={pickFile} onSample={openSample} compact />
        </div>
      )}

      {dragging && (
        <div className="pointer-events-none fixed inset-3 z-50 flex items-center justify-center rounded-2xl border-2 border-dashed border-foreground/30 bg-background/70 font-heading text-lg backdrop-blur-sm">
          Drop the PDF anywhere
        </div>
      )}
    </div>
  )
}

/** Floating Ctrl+F-style stepper over the page: "2 of 5". */
function MatchNavigator({
  index,
  total,
  page,
  onStep,
}: {
  index: number
  total: number
  page?: number
  onStep: (delta: 1 | -1) => void
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border bg-background/90 py-1 pr-1 pl-4 text-sm shadow-lg backdrop-blur">
        <span className="pr-2 tabular-nums">
          {index >= 0 ? index + 1 : "–"}
          <span className="text-muted-foreground"> of {total}</span>
          {page !== undefined && (
            <span className="text-muted-foreground"> · page {page}</span>
          )}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          aria-label="Previous match"
          onClick={() => onStep(-1)}
        >
          <ChevronUpIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full"
          aria-label="Next match"
          onClick={() => onStep(1)}
        >
          <ChevronDownIcon />
        </Button>
      </div>
    </div>
  )
}

function EmptyState({
  onPick,
  onSample,
  compact,
}: {
  onPick: () => void
  onSample: () => void
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-5 text-center",
        !compact && "p-10"
      )}
    >
      {!compact && (
        <>
          <img
            src="/document.png"
            alt=""
            width={143}
            height={180}
            className="doc-art select-none dark:hidden"
            draggable={false}
          />
          <img
            src="/document-dark.png"
            alt=""
            width={143}
            height={180}
            className="hidden select-none dark:block"
            draggable={false}
          />
        </>
      )}
      <div className="max-w-sm">
        <p className="font-heading text-2xl tracking-tight">Open a PDF, then ask.</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Describe what you're after and Jev lights up the lines that answer it,
          like Ctrl+F without the exact words. Text stays on your machine until
          you ask.
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={onPick}>Open PDF</Button>
        <Button variant="outline" onClick={onSample}>
          Try the sample report
        </Button>
      </div>
    </div>
  )
}

export default App
