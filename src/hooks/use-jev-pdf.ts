import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { PDFDocumentProxy } from "pdfjs-dist"

import { sha256 } from "@/lib/cache"
import { exactSearch } from "@/lib/exact"
import { extractDocument } from "@/lib/extract"
import { candidateCount, runMeaningSearch, type Nouls } from "@/lib/jev"
import { meaningResults, nearMisses } from "@/lib/results"
import type { Extraction, Result, SearchMode } from "@/lib/types"

export type DocPhase =
  | { kind: "empty" }
  | { kind: "opening" }
  | { kind: "extracting"; done: number; total: number }
  | { kind: "ready" }
  | { kind: "no-text" }
  | { kind: "error"; message: string }

export type MeaningRun = {
  query: string
  status: "running" | "done" | "stopped" | "error"
  total: number
  checked: number
  nouls: Nouls
  failedBatches: number
  retrying: boolean
  error?: string
  /** Summed over this run's TypeSafe requests (0 requests = all cached). */
  usage: { requests: number; inputTokens: number }
}

export function useJevPdf() {
  const [file, setFile] = useState<File | null>(null)
  const [hash, setHash] = useState<string | null>(null)
  const [phase, setPhase] = useState<DocPhase>({ kind: "empty" })
  const [extraction, setExtraction] = useState<Extraction | null>(null)

  const [query, setQuery] = useState("")
  const [mode, setModeState] = useState<SearchMode>("meaning")
  const [run, setRun] = useState<MeaningRun | null>(null)
  const [busyPages, setBusyPages] = useState<ReadonlySet<number>>(new Set())

  const [activeId, setActiveId] = useState<string | null>(null)
  const [pulse, setPulse] = useState(0)

  const abortRef = useRef<AbortController | null>(null)
  const userPickedRef = useRef(false)

  const stopMeaning = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setBusyPages(new Set())
    setRun((r) => (r?.status === "running" ? { ...r, status: "stopped" } : r))
  }, [])

  // ---- Document -----------------------------------------------------------

  const openFile = useCallback(
    async (f: File) => {
      if (f.type && f.type !== "application/pdf" && !f.name.endsWith(".pdf")) {
        setPhase({ kind: "error", message: "Only PDF files can be opened." })
        return
      }
      stopMeaning()
      setRun(null)
      setActiveId(null)
      setExtraction(null)
      setFile(null)
      setPhase({ kind: "opening" })
      // Hash first: the viewer mounts with the file, and extraction is keyed
      // (and cached) by this hash.
      setHash(await sha256(await f.arrayBuffer()))
      setFile(f)
    },
    [stopMeaning]
  )

  /** Called by the viewer once pdf.js has parsed the document. */
  const onPdfLoaded = useCallback(
    async (pdf: PDFDocumentProxy) => {
      if (!hash) return
      try {
        setPhase({ kind: "extracting", done: 0, total: pdf.numPages })
        const ex = await extractDocument(pdf, hash, (done, total) =>
          setPhase({ kind: "extracting", done, total })
        )
        if (ex.hash !== hash) return
        setExtraction(ex)
        setPhase(
          ex.emptyPages.length === ex.pageCount
            ? { kind: "no-text" }
            : { kind: "ready" }
        )
      } catch (err) {
        setPhase({ kind: "error", message: `Couldn't read this PDF: ${err}` })
      }
    },
    [hash]
  )

  const onPdfError = useCallback((err: Error) => {
    setPhase({ kind: "error", message: `Couldn't open this PDF: ${err.message}` })
  }, [])

  // ---- Search -------------------------------------------------------------

  const updateQuery = useCallback(
    (q: string) => {
      setQuery(q)
      if (mode === "exact") userPickedRef.current = false
      // A running Jev search is for a specific query; editing it cancels.
      if (abortRef.current && run?.query !== q) stopMeaning()
    },
    [mode, run?.query, stopMeaning]
  )

  const searchMeaning = useCallback(
    async (q: string) => {
      const text = q.trim()
      if (!extraction || !text) return
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      userPickedRef.current = false
      setActiveId(null)
      setBusyPages(new Set())

      const total = candidateCount(extraction)
      setRun({
        query: q,
        status: "running",
        total,
        checked: 0,
        nouls: {},
        failedBatches: 0,
        retrying: false,
        usage: { requests: 0, inputTokens: 0 },
      })
      // Check staleness when the update is queued, not inside the updater:
      // React runs updaters later, after `finally` below has cleared the ref.
      const live = (fn: (r: MeaningRun) => MeaningRun) => {
        if (controller.signal.aborted) return
        setRun((r) => (r ? fn(r) : r))
      }
      const inflight = new Map<number, number>()
      const bump = (page: number, d: number) => {
        inflight.set(page, (inflight.get(page) ?? 0) + d)
        if (abortRef.current === controller) {
          setBusyPages(
            new Set([...inflight].filter(([, n]) => n > 0).map(([p]) => p))
          )
        }
      }

      try {
        const { nouls, failedBatches } = await runMeaningSearch(
          extraction,
          text,
          controller.signal,
          {
            onBatchStart: (b) => bump(b.page, 1),
            onBatch: (got, b, meta) => {
              bump(b.page, -1)
              live((r) => ({
                ...r,
                retrying: false,
                checked: r.checked + Object.keys(got).length,
                nouls: { ...r.nouls, ...got },
                usage: {
                  requests: r.usage.requests + 1,
                  inputTokens: r.usage.inputTokens + meta.inputTokens,
                },
              }))
            },
            onBatchError: (b) => bump(b.page, -1),
            onRetry: () => live((r) => ({ ...r, retrying: true })),
          }
        )
        live((r) => ({
          ...r,
          status: "done",
          retrying: false,
          nouls,
          checked: Object.keys(nouls).length,
          failedBatches,
        }))
      } catch (err) {
        if (controller.signal.aborted) return
        live((r) => ({
          ...r,
          status: "error",
          retrying: false,
          error: err instanceof Error ? err.message : String(err),
        }))
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null
          setBusyPages(new Set())
        }
      }
    },
    [extraction]
  )

  useEffect(() => () => abortRef.current?.abort(), [])

  const setMode = useCallback(
    (m: SearchMode) => {
      if (m === mode) return
      stopMeaning()
      setActiveId(null)
      userPickedRef.current = false
      setModeState(m)
      // Switching to Meaning with words already typed asks right away.
      if (m === "meaning" && query.trim() && run?.query.trim() !== query.trim()) {
        void searchMeaning(query)
      }
    },
    [mode, query, run?.query, searchMeaning, stopMeaning]
  )

  // ---- Results ------------------------------------------------------------

  const results: Result[] = useMemo(() => {
    if (!extraction) return []
    if (mode === "exact") return exactSearch(extraction, query)
    return run ? meaningResults(extraction, run.nouls) : []
  }, [extraction, mode, query, run])

  // Nothing cleared the bar: offer the closest lines rather than a dead end.
  const near: Result[] = useMemo(() => {
    if (!extraction || mode !== "meaning" || run?.status !== "done") return []
    return results.length === 0 ? nearMisses(extraction, run.nouls) : []
  }, [extraction, mode, run, results.length])

  const select = useCallback((id: string) => {
    userPickedRef.current = true
    setActiveId(id)
    setPulse((p) => p + 1)
  }, [])

  // Jump to the best match as soon as one exists, and again when the ranking
  // settles, unless the user has already picked something.
  const top = results[0]?.id ?? null
  const settled = mode === "exact" || run?.status === "done"
  useEffect(() => {
    if (userPickedRef.current || !top) return
    if (activeId === null || settled) {
      setActiveId(top)
      setPulse((p) => p + 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top, settled])

  const active =
    results.find((r) => r.id === activeId) ??
    near.find((r) => r.id === activeId) ??
    null
  const activeIndex = active ? results.indexOf(active) : -1

  /** Move through matches like Ctrl+F: wraps at both ends. */
  const step = useCallback(
    (delta: 1 | -1) => {
      if (results.length === 0) return
      const i = activeIndex < 0 ? (delta > 0 ? 0 : -1) : activeIndex + delta
      select(results[(i + results.length) % results.length].id)
    },
    [activeIndex, results, select]
  )

  /**
   * Enter in the search box: ask Jev about a new question, or step through
   * the matches of the one already asked (Shift+Enter goes back).
   */
  const submit = useCallback(
    (back = false) => {
      if (phase.kind !== "ready" || !query.trim()) return
      const asked =
        mode === "exact" ||
        (run?.query.trim() === query.trim() &&
          (run.status === "done" || run.status === "running"))
      if (asked) step(back ? -1 : 1)
      else void searchMeaning(query)
    },
    [phase.kind, query, mode, run, step, searchMeaning]
  )

  return {
    file,
    phase,
    extraction,
    openFile,
    onPdfLoaded,
    onPdfError,
    query,
    setQuery: updateQuery,
    mode,
    setMode,
    run: mode === "meaning" ? run : null,
    searchMeaning,
    stopMeaning,
    busyPages,
    results,
    near,
    active,
    activeIndex,
    pulse,
    select,
    step,
    submit,
  }
}
