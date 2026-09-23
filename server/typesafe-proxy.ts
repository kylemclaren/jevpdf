import type { IncomingMessage, ServerResponse } from "node:http"
import type { Connect, Plugin } from "vite"

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

/**
 * Keeps TYPESAFE_API_KEY server-side during `vite dev` / `vite preview`.
 * The browser POSTs to /api/jev; this forwards it to TypeSafe with the key
 * and relays the status (including 429/529 and Retry-After). Production uses
 * server/index.ts, which shares the same forwarding code.
 */
export function typesafeProxy(apiKey: string | undefined): Plugin {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const path = req.url?.split("?")[0]
    if (path === CONFIG_ROUTE) return send(res, configResponse(apiKey))
    if (path !== ROUTE) return next()
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
  if (req.method !== "POST") return send(res, json(405, { error: "method_not_allowed" }))
  const resolved = resolveApiKey(req, apiKey)
  if ("error" in resolved) return send(res, resolved.error)

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
