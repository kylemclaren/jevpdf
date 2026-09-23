/**
 * Production server: serves the built app from dist/ and proxies /api/jev to
 * TypeSafe with the server-held TYPESAFE_API_KEY. Run: bun server/index.ts
 *
 * Because the deployed proxy spends real credits, it only accepts same-origin
 * POSTs from the app, pins the model, caps body size and rate-limits per IP.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { readFile, stat } from "node:fs/promises"
import { extname, join, normalize } from "node:path"

import {
  CONFIG_ROUTE,
  configResponse,
  forwardToJev,
  json,
  readBody,
  resolveApiKey,
  ROUTE,
  send,
} from "./jev-upstream.ts"

const PORT = Number(process.env.PORT ?? 8080)
const API_KEY = process.env.TYPESAFE_API_KEY
const DIST = join(import.meta.dirname, "..", "dist")

/** Requests per IP per minute. One search over a 400-line PDF is ~25. */
const RATE_LIMIT = 240
const RATE_WINDOW_MS = 60_000

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".pdf": "application/pdf",
  ".wasm": "application/wasm",
  ".bcmap": "application/octet-stream",
}

/**
 * Users may keep their TypeSafe key in this origin's storage, so only our
 * own scripts may run: no third-party or inline script, no framing. pdf.js
 * needs blob:/data: for fonts and images and wasm for some image decoders.
 */
const SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "worker-src 'self' blob:",
    "connect-src 'self' blob: data:",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
}

const hits = new Map<string, { count: number; reset: number }>()

createServer((req, res) => {
  const path = (req.url ?? "/").split("?")[0]
  const done =
    path === CONFIG_ROUTE
      ? Promise.resolve(send(res, configResponse(API_KEY)))
      : path === ROUTE
        ? handleJev(req, res)
        : handleStatic(path, req, res)
  done.catch((err) => {
    console.error(err)
    if (!res.headersSent) send(res, json(500, { error: "internal" }))
  })
}).listen(PORT, "0.0.0.0", () => {
  console.log(
    `jevpdf listening on :${PORT}` +
      (API_KEY ? "" : " (no server key: users bring their own TypeSafe key)")
  )
})

async function handleJev(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") return send(res, json(405, { error: "method_not_allowed" }))
  if (!sameOrigin(req)) return send(res, json(403, { error: "forbidden" }))
  const resolved = resolveApiKey(req, API_KEY)
  if ("error" in resolved) return send(res, resolved.error)
  if (!allow(clientIp(req))) {
    return send(res, {
      ...json(429, { error: "rate_limited" }),
      headers: { "Content-Type": "application/json", "Retry-After": "10" },
    })
  }

  let body: string
  try {
    body = await readBody(req)
  } catch {
    return send(res, json(413, { error: "body_too_large" }))
  }

  const controller = new AbortController()
  res.on("close", () => {
    if (!res.writableEnded) controller.abort()
  })
  try {
    send(res, await forwardToJev(body, resolved.key, controller.signal))
  } catch (err) {
    if (controller.signal.aborted) return
    send(res, json(502, { error: "upstream_unreachable", detail: String(err) }))
  }
}

async function handleStatic(path: string, req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, json(405, { error: "method_not_allowed" }))
  }
  // Resolve inside dist/ only; anything unknown falls back to the SPA shell.
  const safe = normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, "")
  let file = join(DIST, safe)
  if (!file.startsWith(DIST) || !(await isFile(file))) file = join(DIST, "index.html")

  const data = await readFile(file)
  res.writeHead(200, {
    "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
    "Content-Length": data.length,
    // Hashed build assets never change; everything else revalidates.
    "Cache-Control": file.includes(`${join(DIST, "assets")}`)
      ? "public, max-age=31536000, immutable"
      : "no-cache",
    "X-Content-Type-Options": "nosniff",
    ...SECURITY_HEADERS,
  })
  res.end(req.method === "HEAD" ? undefined : data)
}

/** Browsers send Origin on every POST; it must match the host we serve. */
function sameOrigin(req: IncomingMessage) {
  const origin = req.headers.origin
  if (!origin) return false
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

function clientIp(req: IncomingMessage) {
  const flyIp = req.headers["fly-client-ip"]
  return (Array.isArray(flyIp) ? flyIp[0] : flyIp) ?? req.socket.remoteAddress ?? "?"
}

function allow(ip: string) {
  const now = Date.now()
  const entry = hits.get(ip)
  if (!entry || entry.reset < now) {
    hits.set(ip, { count: 1, reset: now + RATE_WINDOW_MS })
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.reset < now) hits.delete(k)
    }
    return true
  }
  entry.count++
  return entry.count <= RATE_LIMIT
}

async function isFile(path: string) {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}
