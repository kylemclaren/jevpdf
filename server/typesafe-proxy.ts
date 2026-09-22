import type { IncomingMessage, ServerResponse } from "node:http"
import type { Connect, Plugin } from "vite"

const UPSTREAM = "https://api.typesafe.ai/v1/systemone"
const ROUTE = "/api/jev"
const MAX_BODY_BYTES = 1_000_000

/**
 * Keeps TYPESAFE_API_KEY server-side. The browser POSTs to /api/jev; this
 * forwards the body to TypeSafe with the Bearer key and relays the status
 * (including 429/529 and Retry-After) so the client can back off.
 * Runs in both `vite dev` and `vite preview`.
 */
export function typesafeProxy(apiKey: string | undefined): Plugin {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url?.split("?")[0] !== ROUTE) return next()
    void handle(req, res, apiKey)
  }
  return {
    name: "jevpdf-typesafe-proxy",
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  }
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  apiKey: string | undefined
) {
  if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" })
  if (!apiKey) return send(res, 503, { error: "missing_api_key" })

  let body: string
  try {
    body = await readBody(req)
  } catch {
    return send(res, 413, { error: "body_too_large" })
  }

  const controller = new AbortController()
  res.on("close", () => {
    if (!res.writableEnded) controller.abort()
  })

  try {
    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body,
      signal: controller.signal,
    })
    const headers: Record<string, string> = {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
    }
    const retryAfter = upstream.headers.get("retry-after")
    if (retryAfter) headers["Retry-After"] = retryAfter
    res.writeHead(upstream.status, headers)
    res.end(await upstream.text())
  } catch (err) {
    if (controller.signal.aborted) return
    send(res, 502, { error: "upstream_unreachable", detail: String(err) })
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error("too large"))
        req.destroy()
      } else chunks.push(chunk)
    })
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    req.on("error", reject)
  })
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(JSON.stringify(body))
}
