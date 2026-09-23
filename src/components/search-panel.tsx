import { useEffect, useRef } from "react"
import { BorderBeam } from "border-beam"
import { Ring } from "loading-dev"
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  FileUpIcon,
  KeyRoundIcon,
  MonitorIcon,
  MoonIcon,
  PencilIcon,
  SearchIcon,
  SearchXIcon,
  SquareIcon,
  SunIcon,
  TextSearchIcon,
  XIcon,
} from "lucide-react"

import { ApiKeyDialog } from "@/components/api-key-dialog"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { useJevPdf } from "@/hooks/use-jev-pdf"
import { maskApiKey } from "@/lib/api-key"
import { INPUT_TOKEN_PRICE_USD, NEAR_MISS_FLOOR } from "@/lib/jev-config"
import { SAMPLE_FILE_NAME, SAMPLE_QUERIES } from "@/lib/sample"
import type { Result } from "@/lib/types"
import { cn } from "@/lib/utils"

type Jev = ReturnType<typeof useJevPdf>

export function SearchPanel({
  jev,
  onPickFile,
  onShowOnPage,
  className,
}: {
  jev: Jev
  onPickFile: () => void
  onShowOnPage: (r: Result) => void
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { phase, extraction, mode, query, run, results, near, active } = jev
  const ready = phase.kind === "ready"
  const running = run?.status === "running"
  const asked =
    mode === "exact" || (run !== null && run.query.trim() === query.trim())

  // "/" or ⌘F / Ctrl+F jumps to search — this app is the find bar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement &&
        (e.target.isContentEditable || /INPUT|TEXTAREA/.test(e.target.tagName))
      const find = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f"
      if (find || (e.key === "/" && !typing)) {
        if (!inputRef.current || inputRef.current.disabled) return
        e.preventDefault()
        inputRef.current.focus()
        inputRef.current.select()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Focus the box as soon as a document is ready to search.
  useEffect(() => {
    if (ready) inputRef.current?.focus()
  }, [ready])

  const suggestions =
    jev.file?.name === SAMPLE_FILE_NAME ? SAMPLE_QUERIES : null

  return (
    <aside className={cn("flex min-h-0 flex-col bg-background", className)}>
      {jev.file && (
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
          <div className="min-w-0">
            <p className="truncate font-heading text-[15px] leading-tight">
              {jev.file.name.replace(/\.pdf$/i, "")}
            </p>
            {extraction && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {extraction.pageCount}{" "}
                {extraction.pageCount === 1 ? "page" : "pages"}
              </p>
            )}
          </div>
          {/* Pulled into the gutter so its edge lines up with the search box. */}
          <Button
            variant="ghost"
            size="sm"
            className="-mt-1 -mr-2.5 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={onPickFile}
          >
            <FileUpIcon data-icon="inline-start" />
            Open
          </Button>
        </header>
      )}

      <div className={cn("flex flex-col gap-2.5 px-5 pb-3", !jev.file && "pt-5")}>
        <BorderBeam
          size="line"
          colorVariant="colorful"
          theme="auto"
          active={running}
          strength={0.8}
        >
          <div className="relative rounded-lg bg-card">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => jev.setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  jev.submit(e.shiftKey)
                } else if (e.key === "Escape") {
                  if (running) jev.stopMeaning()
                  else if (query) jev.setQuery("")
                  else inputRef.current?.blur()
                }
              }}
              placeholder={
                !jev.file
                  ? "Open a PDF to start"
                  : mode === "meaning"
                    ? "What are you looking for?"
                    : "Exact words on the page"
              }
              disabled={!ready}
              className="h-11 bg-transparent pr-20 pl-9 text-[15px]"
              aria-label="Search this PDF"
            />
            <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-0.5">
              {query && !running && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Clear"
                  onClick={() => {
                    jev.setQuery("")
                    inputRef.current?.focus()
                  }}
                >
                  <XIcon />
                </Button>
              )}
              {mode === "meaning" &&
                (running ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Stop"
                    onClick={jev.stopMeaning}
                  >
                    <SquareIcon className="fill-current" />
                  </Button>
                ) : (
                  <Button
                    size="icon-sm"
                    aria-label="Ask"
                    disabled={!ready || !query.trim() || asked}
                    onClick={() => jev.submit()}
                  >
                    <ArrowRightIcon />
                  </Button>
                ))}
            </div>
          </div>
        </BorderBeam>

        <div className="flex items-center justify-between gap-2">
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            value={[mode]}
            onValueChange={(v: string[]) => {
              const next = v[0]
              if (next === "meaning" || next === "exact") jev.setMode(next)
            }}
          >
            <ToggleGroupItem value="meaning">Meaning</ToggleGroupItem>
            <ToggleGroupItem value="exact">Exact text</ToggleGroupItem>
          </ToggleGroup>
          {ready && (
            <span className="text-xs text-muted-foreground">
              {results.length > 1 && asked
                ? "Enter for next"
                : mode === "exact"
                  ? "Matches as you type"
                  : query.trim() && !asked
                    ? "Enter to ask"
                    : null}
            </span>
          )}
        </div>
      </div>

      <Status jev={jev} />

      {ready && !query && !run && suggestions && (
        <div className="flex flex-col gap-0.5 px-5 pb-4">
          <p className="pb-1.5 text-xs text-muted-foreground">Try asking</p>
          {suggestions.map((q) => (
            <button
              key={q}
              type="button"
              className="-mx-2 rounded-md px-2 py-1.5 text-left font-heading text-[15px] text-foreground/80 hover:bg-accent hover:text-foreground"
              onClick={() => {
                jev.setQuery(q)
                if (mode === "meaning") void jev.searchMeaning(q)
                else jev.setMode("meaning")
              }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto border-t">
        {ready && results.length === 0 && near.length === 0 &&
          ((mode === "meaning" && run?.status === "done") ||
            (mode === "exact" && query.trim())) && (
            <NoMatches
              mode={mode}
              query={mode === "meaning" ? run!.query : query}
              spans={run?.total}
              onRephrase={() => {
                inputRef.current?.focus()
                inputRef.current?.select()
              }}
              onSwitch={() =>
                jev.setMode(mode === "meaning" ? "exact" : "meaning")
              }
            />
          )}
        {results.length > 0 && (
          <ol className="flex flex-col gap-1 px-2 py-2">
            {results.map((r, i) => (
              <ResultRow
                key={r.id}
                result={r}
                rank={i + 1}
                mode={mode}
                query={query}
                active={active?.id === r.id}
                onSelect={() => jev.select(r.id)}
                onShowOnPage={() => onShowOnPage(r)}
              />
            ))}
          </ol>
        )}
        {near.length > 0 && (
          <div className="px-2 py-3">
            <p className="px-3 pb-1 text-xs text-muted-foreground">
              Closest lines, though none clearly answer it
            </p>
            <ol className="flex flex-col gap-1 opacity-75">
              {near.map((r) => (
                <ResultRow
                  key={r.id}
                  result={r}
                  mode={mode}
                  query={query}
                  active={active?.id === r.id}
                  onSelect={() => jev.select(r.id)}
                  onShowOnPage={() => onShowOnPage(r)}
                />
              ))}
            </ol>
          </div>
        )}
      </div>

      {extraction && extraction.emptyPages.length > 0 && ready && (
        <p className="border-t px-5 py-2 text-xs text-muted-foreground">
          {extraction.emptyPages.length === 1 ? "Page " : "Pages "}
          {extraction.emptyPages.join(", ")}{" "}
          {extraction.emptyPages.length === 1 ? "has" : "have"} no text layer
          (scanned?) and can't be searched.
        </p>
      )}

      <Footer jev={jev} />
      <ApiKeyDialog
        open={jev.keyDialogOpen}
        currentKey={jev.apiKey}
        serverKey={jev.serverKey}
        onClose={jev.closeKeyDialog}
      />
    </aside>
  )
}

const THEMES = [
  { value: "system", label: "System theme", Icon: MonitorIcon },
  { value: "light", label: "Light theme", Icon: SunIcon },
  { value: "dark", label: "Dark theme", Icon: MoonIcon },
] as const

/** One button that cycles system → light → dark. */
function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const i = Math.max(0, THEMES.findIndex((t) => t.value === theme))
  const { label, Icon } = THEMES[i]
  const next = THEMES[(i + 1) % THEMES.length]
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground"
      aria-label={`${label}. Switch to ${next.label.toLowerCase()}`}
      title={`${label} (click for ${next.label.toLowerCase()})`}
      onClick={() => setTheme(next.value)}
    >
      <Icon />
    </Button>
  )
}

/** Theme, what the current search cost, and the repo link. */
function Footer({ jev }: { jev: Jev }) {
  const { run } = jev
  const u = run?.usage
  const cost = u ? u.inputTokens * INPUT_TOKEN_PRICE_USD : 0
  const fromCache = run?.status === "done" && u?.requests === 0

  return (
    <footer className="grid grid-cols-[4rem_1fr_4rem] items-center border-t px-2 py-1.5">
      <ThemeToggle />
      <div className="text-center text-xs text-muted-foreground tabular-nums">
        {u ? (
          <span title="TypeSafe cost of this search (input tokens; output is free)">
            {fromCache ? (
              "Cached · no cost"
            ) : (
              <>
                Search cost{" "}
                <span
                  className={cn(
                    "text-foreground",
                    run?.status === "running" && "animate-pulse"
                  )}
                >
                  {run?.status === "running" && cost === 0 ? "…" : formatUsd(cost)}
                </span>
              </>
            )}
          </span>
        ) : (
          <a
            href="https://typesafe.ai"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-foreground"
          >
            Powered by TypeSafe Jev
          </a>
        )}
      </div>
      <div className="flex items-center justify-self-end">
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative text-muted-foreground"
          aria-label={jev.apiKey ? "Your TypeSafe API key (set)" : "Add your TypeSafe API key"}
          title={
            jev.apiKey
              ? `Using your TypeSafe key ${maskApiKey(jev.apiKey)}`
              : "Add your TypeSafe API key"
          }
          onClick={jev.openKeyDialog}
        >
          <KeyRoundIcon />
          {jev.apiKey && (
            <span className="absolute top-1 right-1 size-1.5 rounded-full bg-emerald-500" />
          )}
        </Button>
        <a
          href="https://github.com/kylemclaren/jevpdf"
          target="_blank"
          rel="noreferrer"
          aria-label="Source on GitHub"
          title="kylemclaren/jevpdf on GitHub"
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <GitHubMark className="size-3.5" />
        </a>
      </div>
    </footer>
  )
}

function formatUsd(n: number) {
  if (n === 0) return "$0"
  return n < 0.0001 ? "<$0.0001" : `$${n.toFixed(4)}`
}

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

function NoMatches({
  mode,
  query,
  spans,
  onRephrase,
  onSwitch,
}: {
  mode: "meaning" | "exact"
  query: string
  spans?: number
  onRephrase: () => void
  onSwitch: () => void
}) {
  const meaning = mode === "meaning"
  return (
    <Empty className="py-10">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {meaning ? <SearchXIcon /> : <TextSearchIcon />}
        </EmptyMedia>
        <EmptyTitle className="font-heading text-base">
          {meaning ? "No clear answer in this PDF" : "Those words aren't on any page"}
        </EmptyTitle>
        <EmptyDescription>
          {meaning ? (
            <>
              Jev read {spans ? `all ${spans.toLocaleString()} lines` : "every line"}{" "}
              and none answer <q className="text-foreground">{query.trim()}</q>.
              Try other words, or search for a phrase you expect to see.
            </>
          ) : (
            <>
              No page contains <q className="text-foreground">{query.trim()}</q>.
              Ask by meaning to find it in other words.
            </>
          )}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center gap-2">
        <Button variant="outline" size="sm" onClick={onRephrase}>
          <PencilIcon data-icon="inline-start" />
          Rephrase
        </Button>
        <Button variant="ghost" size="sm" onClick={onSwitch}>
          {meaning ? "Try exact text" : "Ask by meaning"}
        </Button>
      </EmptyContent>
    </Empty>
  )
}

function Status({ jev }: { jev: Jev }) {
  const { phase, mode, run, results, query } = jev
  let content: React.ReactNode = null
  const n = results.length
  const matches = `${n} ${n === 1 ? "match" : "matches"}`

  if (phase.kind === "opening") {
    content = <Line spinner>Opening…</Line>
  } else if (phase.kind === "extracting") {
    content = (
      <Line spinner>
        Reading page {phase.done} of {phase.total}
      </Line>
    )
  } else if (phase.kind === "no-text") {
    content = (
      <p className="text-sm leading-relaxed">
        This PDF has no text layer. It looks like a scan, and search reads
        text, not images, so there's nothing here to search.
      </p>
    )
  } else if (phase.kind === "error") {
    content = <p className="text-sm text-destructive">{phase.message}</p>
  } else if (phase.kind === "ready" && mode === "exact" && query.trim()) {
    content = n > 0 ? <Line>{matches}</Line> : null
  } else if (phase.kind === "ready" && run) {
    if (run.status === "running") {
      content = (
        <Line spinner>
          {run.retrying
            ? "TypeSafe is busy, retrying…"
            : `Jev is checking ${run.total.toLocaleString()} spans`}
          {n > 0 && <span className="text-foreground"> · {matches}</span>}
        </Line>
      )
    } else if (run.status === "done") {
      content = (
        <Line>
          {n > 0 && `${matches} · `}
          {run.total.toLocaleString()} spans checked
          {run.failedBatches > 0 && (
            <span className="text-destructive">
              {" "}
              · {run.failedBatches}{" "}
              {run.failedBatches === 1 ? "batch" : "batches"} failed
            </span>
          )}
        </Line>
      )
    } else if (run.status === "stopped") {
      content = <Line>Stopped · {matches} so far</Line>
    } else {
      content = (
        <p className="text-sm text-destructive">
          {run.error}
          {run.needsKey && (
            <>
              {" "}
              <KeyLink onClick={jev.openKeyDialog}>
                {jev.apiKey ? "Update key" : "Add key"}
              </KeyLink>
            </>
          )}
        </p>
      )
    }
  } else if (phase.kind === "ready" && mode === "meaning" && jev.needsKey) {
    content = (
      <Item variant="outline" size="sm">
        <ItemContent>
          <ItemTitle>Add your TypeSafe key</ItemTitle>
          <ItemDescription>Needed for Meaning search.</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button size="sm" variant="outline" onClick={jev.openKeyDialog}>
            Add key
          </Button>
        </ItemActions>
      </Item>
    )
  }

  if (!content) return null
  return (
    <div className="px-5 pb-3" aria-live="polite">
      {content}
    </div>
  )
}

function KeyLink({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
    >
      {children}
    </button>
  )
}

function Line({
  children,
  spinner,
}: {
  children: React.ReactNode
  spinner?: boolean
}) {
  return (
    <div className="flex min-h-5 items-center gap-2 text-sm text-muted-foreground">
      {spinner && <Ring size={16} className="shrink-0 text-foreground" />}
      <span>{children}</span>
    </div>
  )
}

function ResultRow({
  result,
  rank,
  mode,
  query,
  active,
  onSelect,
  onShowOnPage,
}: {
  result: Result
  rank?: number
  mode: "meaning" | "exact"
  query: string
  active: boolean
  onSelect: () => void
  onShowOnPage: () => void
}) {
  const ref = useRef<HTMLLIElement>(null)
  // Keep the active row visible when stepping with Enter.
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" })
  }, [active])

  return (
    <li ref={ref}>
      <div
        role="button"
        tabIndex={0}
        aria-current={active || undefined}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onSelect()
          }
        }}
        className={cn(
          "flex w-full cursor-pointer gap-3 rounded-lg px-3 py-2.5 text-left transition-colors outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring/50",
          active ? "bg-accent" : "hover:bg-accent/50"
        )}
      >
        {rank !== undefined && (
          <span className="w-4 shrink-0 pt-0.5 text-right text-xs text-muted-foreground tabular-nums">
            {rank}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-3 font-heading text-[15px] leading-snug">
            {mode === "exact" ? (
              <Emphasis text={result.text} needle={query} />
            ) : (
              result.text
            )}
          </p>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="whitespace-nowrap tabular-nums">Page {result.page}</span>
            {mode === "meaning" && (
              <span
                className="relative h-1 w-20 overflow-hidden rounded-full bg-muted md:w-40"
                title={`Jev confidence ${result.score.toFixed(2)}`}
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${heatFill(result.score) * 100}%`,
                    // The gradient spans the whole track, so a longer bar
                    // reaches further into the hot end.
                    backgroundImage: HEAT_GRADIENT,
                    backgroundSize: `${100 / heatFill(result.score)}% 100%`,
                  }}
                />
              </span>
            )}
            <button
              type="button"
              className="ml-auto inline-flex items-center gap-0.5 font-medium text-foreground md:hidden"
              onClick={(e) => {
                e.stopPropagation()
                onShowOnPage()
              }}
            >
              Show on page
              <ArrowUpRightIcon className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </li>
  )
}

/**
 * How much of the confidence track a score fills. The track starts at the
 * near-miss floor, not 0, so hits (0.55+) spread across the bar instead of
 * bunching at its end.
 */
function heatFill(score: number) {
  const t = (score - NEAR_MISS_FLOOR) / (1 - NEAR_MISS_FLOOR)
  return Math.min(1, Math.max(0.04, t))
}

/** Cool to hot along the confidence track: pale yellow → amber → red-orange. */
const HEAT_GRADIENT = `linear-gradient(90deg, ${[0, 0.4, 0.6, 0.8, 1]
  .map((t) => heat(t))
  .join(", ")})`

function heat(t: number) {
  const hue = 100 - 72 * t // 100 yellow → 28 red-orange
  const chroma = 0.07 + 0.13 * t
  const lightness = 0.88 - 0.22 * t
  return `oklch(${lightness} ${chroma} ${hue})`
}

function Emphasis({ text, needle }: { text: string; needle: string }) {
  const n = needle.trim().replace(/\s+/g, " ")
  if (!n) return <>{text}</>
  const escaped = n
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/ /g, "\\s+")
  const parts = text.split(new RegExp(`(${escaped})`, "i"))
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-[2px] bg-mark px-0.5 text-inherit">
            {p}
          </mark>
        ) : (
          p
        )
      )}
    </>
  )
}
