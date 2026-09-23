/** Shared by the Vite dev middleware and the production Bun server. */

import type { IncomingMessage, ServerResponse } from "node:http"

export const UPSTREAM = "https://api.typesafe.ai/v1/systemone"
export const ROUTE = "/api/jev"
export const MAX_BODY_BYTES = 1_000_000
/** The only model the app uses; the proxy pins it so it can't be swapped. */
export const MODEL = "jev-latest"

export type UpstreamResult = {
  status: number
  headers: Record<string, string>
  body: string
}

/**
 * Validate the browser's request body and forward it to TypeSafe with the
 * server-held key. Returns a plain result both servers can write out.
 */
export async function forwardToJev(
  rawBody: string,
  apiKey: string | undefined,
  signal?: AbortSignal
): Promise<UpstreamResult> {
  if (!apiKey) return json(503, { error: "missing_api_key" })
  if (rawBody.length > MAX_BODY_BYTES) return json(413, { error: "body_too_large" })

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return json(400, { error: "invalid_json" })
  }
  if (!payload || typeof payload !== "object" || !payload.questions || !payload.state) {
    return json(400, { error: "invalid_request" })
  }
  payload.model = MODEL

  const upstream = await fetch(UPSTREAM, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  })
  const headers: Record<string, string> = {
    "Content-Type": upstream.headers.get("content-type") ?? "application/json",
  }
  const retryAfter = upstream.headers.get("retry-after")
  if (retryAfter) headers["Retry-After"] = retryAfter
  return { status: upstream.status, headers, body: await upstream.text() }
}

export function json(status: number, body: unknown): UpstreamResult {
  return {
    status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }
}

export function readBody(req: IncomingMessage): Promise<string> {
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

export function send(res: ServerResponse, result: UpstreamResult) {
  res.writeHead(result.status, result.headers)
  res.end(result.body)
}
