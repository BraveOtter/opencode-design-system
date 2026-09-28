import { randomBytes } from "node:crypto"
import { spawn } from "node:child_process"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { readFile } from "node:fs/promises"
import path from "node:path"
import type { Context } from "@opencode/plugin/promise/plugin"
import { DESIGN_SYSTEM_DIR, resolveInside } from "./paths.js"
import { regeneratePreview, readManifest } from "./generator.js"
import type { DesignSystemManifest } from "./types.js"

const MAX_PROMPT_LENGTH = 20_000
const MAX_BODY_LENGTH = 128 * 1024

type ReviewContext = Pick<Context, "event" | "session">
type ReviewStatus = "idle" | "working"
type ReviewMessage = { id: string; role: "user" | "assistant" | "system"; text: string; created?: number }
type ResolvedReviewReference =
  | { type: "component"; name: string; file: string; tokens: string[] }
  | { type: "pattern"; name: string; file: string; tokens: string[] }
  | { type: "token"; path: string; theme: string; file: string; value: string }
type ReviewCatalog = { manifest: DesignSystemManifest; tokens: Record<string, unknown>; designSystemRoot: string }

export interface ReviewService {
  open(sessionID: string): Promise<{ url: string; browserOpened: boolean; browserError?: string }>
  close(): Promise<void>
}

export function createReviewService(input: {
  projectRoot: string
  context: ReviewContext
  autoOpen: boolean
}): ReviewService {
  const { projectRoot, context, autoOpen } = input
  const previewRoot = resolveInside(projectRoot, DESIGN_SYSTEM_DIR)
  const tokenToSession = new Map<string, string>()
  const sessionToToken = new Map<string, string>()
  const statusBySession = new Map<string, ReviewStatus>()
  const clients = new Set<{ sessionID: string; response: ServerResponse; heartbeat: ReturnType<typeof setInterval> }>()
  const eventController = new AbortController()
  let server: Server | undefined
  let serverStart: Promise<number> | undefined
  let closed = false
  let sawServerConnected = false

  const broadcast = (sessionID: string, event: string, data: Record<string, unknown> = {}) => {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    for (const client of clients) {
      if (client.sessionID === sessionID && !client.response.destroyed) client.response.write(message)
    }
  }

  const ensureEventListener = () => {
    void (async () => {
      while (!eventController.signal.aborted) {
        try {
          for await (const event of context.event.subscribe({ signal: eventController.signal })) {
            if (!event || typeof event !== "object") continue
            const typedEvent = event as { type?: string; data?: { sessionID?: string; status?: { type?: string } } }
            if (typedEvent.type === "server.connected") {
              if (sawServerConnected) {
                for (const sessionID of sessionToToken.keys()) {
                  statusBySession.set(sessionID, "idle")
                  broadcast(sessionID, "sync", { status: "idle" })
                  try {
                    const preview = await regeneratePreview(projectRoot)
                    broadcast(sessionID, "preview", { preview: preview.preview })
                  } catch {
                    broadcast(sessionID, "review-error", { message: "No se pudo actualizar la preview tras reconectar con OpenCode." })
                  }
                }
              }
              sawServerConnected = true
              continue
            }
            const sessionID = typedEvent.data?.sessionID
            if (!sessionID || !sessionToToken.has(sessionID)) continue

            if (typedEvent.type === "session.status") {
              statusBySession.set(sessionID, typedEvent.data?.status?.type === "idle" ? "idle" : "working")
            } else if (typedEvent.type === "session.execution.started") {
              statusBySession.set(sessionID, "working")
            } else if (["session.execution.succeeded", "session.execution.failed", "session.execution.interrupted", "session.idle"].includes(typedEvent.type ?? "")) {
              statusBySession.set(sessionID, "idle")
            }

            broadcast(sessionID, "update", { type: typedEvent.type, status: statusBySession.get(sessionID) ?? "idle" })

            const sessionFinished = [
              "session.execution.succeeded",
              "session.execution.failed",
              "session.execution.interrupted",
              "session.idle",
            ].includes(typedEvent.type ?? "")
            const reportedIdle = typedEvent.type === "session.status" && typedEvent.data?.status?.type === "idle"
            if (sessionFinished || reportedIdle) {
              try {
                const preview = await regeneratePreview(projectRoot)
                broadcast(sessionID, "preview", { preview: preview.preview })
              } catch {
                broadcast(sessionID, "review-error", { message: "No se pudo actualizar la preview automáticamente. Puedes intentarlo con el botón de actualizar." })
              }
            }
          }
        } catch {
          if (eventController.signal.aborted) return
        }
        if (eventController.signal.aborted) return
        await waitForRetry(eventController.signal)
      }
    })()
  }

  const handleRequest = async (request: IncomingMessage, response: ServerResponse, port: number) => {
    setBaseHeaders(response)
    const expectedHost = `127.0.0.1:${port}`
    if (request.headers.host !== expectedHost) {
      writeText(response, 403, "Forbidden")
      return
    }

    const url = new URL(request.url ?? "/", `http://${expectedHost}`)
    if (request.method === "GET" && url.pathname.startsWith("/open/")) {
      const token = url.pathname.slice("/open/".length)
      if (!/^[a-f0-9]{48}$/.test(token) || !tokenToSession.has(token)) {
        writeText(response, 404, "This review link is no longer available.")
        return
      }
      response.writeHead(303, {
        "Cache-Control": "no-store",
        "Location": "/",
        "Set-Cookie": `ds_review=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`,
      })
      response.end()
      return
    }

    const sessionID = authorizedSession(request, tokenToSession)
    if (!sessionID) {
      writeText(response, 401, "Open the review link from the OpenCode conversation.")
      return
    }

    if (request.method === "GET" && url.pathname === "/") {
      const page = renderReviewPage()
      writeHtml(response, page.html, `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${page.nonce}'; connect-src 'self'; frame-src 'self'; img-src data:; form-action 'self'; base-uri 'none'; object-src 'none'`)
      return
    }

    if (request.method === "GET" && url.pathname === "/preview") {
      try {
        const manifest = await readManifest(projectRoot)
        const previewPath = resolveInside(previewRoot, manifest.preview)
        const html = await readFile(previewPath, "utf8")
        response.writeHead(200, {
          "Cache-Control": "no-store",
          "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'; object-src 'none'",
          "Content-Type": "text/html; charset=utf-8",
        })
        response.end(html)
      } catch {
        writeJson(response, 404, { error: "The generated preview is not available. Regenerate it and try again." })
      }
      return
    }

    if (request.method === "GET" && url.pathname === "/api/messages") {
      try {
        const contextMessages = await context.session.context({ sessionID })
        const messages = normalizeMessages(contextMessages)
        const latest = Array.isArray(contextMessages) ? contextMessages.at(-1) as { type?: string; time?: { completed?: number } } | undefined : undefined
        const inferredStatus = latest?.type === "assistant" && latest.time?.completed === undefined ? "working" : "idle"
        writeJson(response, 200, {
          sessionID,
          status: statusBySession.get(sessionID) ?? inferredStatus,
          messages,
        })
      } catch {
        writeJson(response, 502, { error: "No se pudo leer la conversación de OpenCode." })
      }
      return
    }

    if (request.method === "GET" && url.pathname === "/api/events") {
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Connection": "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
      })
      response.write(": connected\n\n")
      const client = {
        sessionID,
        response,
        heartbeat: setInterval(() => {
          if (!response.destroyed) response.write(": keep-alive\n\n")
        }, 20_000),
      }
      client.heartbeat.unref()
      clients.add(client)
      response.on("close", () => {
        clearInterval(client.heartbeat)
        clients.delete(client)
      })
      return
    }

    if (request.method === "POST" && ["/api/prompt", "/api/preview", "/api/reference"].includes(url.pathname)) {
      if (request.headers.origin !== `http://${expectedHost}` || request.headers["sec-fetch-site"] === "cross-site") {
        writeText(response, 403, "Cross-origin request denied")
        return
      }
      if (url.pathname === "/api/prompt") {
        try {
          const payload = JSON.parse(await readRequestBody(request)) as { text?: unknown; delivery?: unknown; references?: unknown }
          const text = typeof payload.text === "string" ? payload.text.trim() : ""
          const delivery = payload.delivery === "queue" ? "queue" : "steer"
          if (!text || text.length > MAX_PROMPT_LENGTH) {
            writeJson(response, 400, { error: `Escribe un mensaje de hasta ${MAX_PROMPT_LENGTH.toLocaleString("es-ES")} caracteres.` })
            return
          }
          const rawReferences = payload.references === undefined ? [] : payload.references
          if (!Array.isArray(rawReferences) || rawReferences.length > 8) {
            writeJson(response, 400, { error: "Puedes adjuntar hasta 8 elementos seleccionados de la preview." })
            return
          }
          let references: ResolvedReviewReference[] = []
          if (rawReferences.length) {
            const catalog = await loadReviewCatalog(projectRoot)
            const resolved = await Promise.all(rawReferences.map((reference) => resolveReviewReference(catalog, reference)))
            const staleReferences = rawReferences.filter((_, index) => !resolved[index])
            if (staleReferences.length) {
              writeJson(response, 409, {
                error: "Una o más referencias ya no existen en el Design System actual. Elimínalas o selecciona de nuevo los elementos antes de enviar.",
                staleReferences,
              })
              return
            }
            references = resolved as ResolvedReviewReference[]
          }
          const promptText = references.length ? promptWithReferences(text, references) : text
          await context.session.prompt({ sessionID, text: promptText, delivery })
          writeJson(response, 202, { accepted: true, references })
        } catch (error) {
          const tooLarge = error instanceof RequestSizeError
          writeJson(response, tooLarge ? 413 : 400, { error: tooLarge ? "El mensaje supera el tamaño permitido." : errorMessage(error) })
        }
        return
      }

      if (url.pathname === "/api/reference") {
        try {
          const payload = JSON.parse(await readRequestBody(request)) as { reference?: unknown }
          const catalog = await loadReviewCatalog(projectRoot)
          const reference = await resolveReviewReference(catalog, payload.reference)
          if (!reference) {
            writeJson(response, 409, { error: "El elemento seleccionado ya no está disponible. Actualiza la preview y selecciónalo de nuevo." })
            return
          }
          writeJson(response, 200, { reference })
        } catch (error) {
          const tooLarge = error instanceof RequestSizeError
          writeJson(response, tooLarge ? 413 : 400, { error: tooLarge ? "La referencia supera el tamaño permitido." : errorMessage(error) })
        }
        return
      }

      try {
        const result = await regeneratePreview(projectRoot)
        broadcast(sessionID, "preview", { preview: result.preview })
        writeJson(response, 200, result)
      } catch {
        writeJson(response, 500, { error: "No se pudo regenerar la preview. Revisa los archivos del Design System." })
      }
      return
    }

    if (request.method === "GET" && url.pathname === "/api/status") {
      writeJson(response, 200, { status: statusBySession.get(sessionID) ?? "idle" })
      return
    }

    writeText(response, 404, "Not found")
  }

  const ensureServer = async (): Promise<number> => {
    if (closed) throw new Error("La vista de revisión ya está cerrada.")
    if (serverStart) return serverStart
    server = createServer((request, response) => {
      void handleRequest(request, response, serverPort).catch(() => {
        if (!response.headersSent) writeJson(response, 500, { error: "Error interno de la vista de revisión." })
        else response.end()
      })
    })
    serverStart = new Promise<number>((resolve, reject) => {
      const currentServer = server!
      const onError = (error: Error) => reject(error)
      currentServer.once("error", onError)
      currentServer.listen(0, "127.0.0.1", () => {
        currentServer.off("error", onError)
        const address = currentServer.address()
        if (!address || typeof address === "string") {
          reject(new Error("No se pudo obtener el puerto de la vista de revisión."))
          return
        }
        serverPort = address.port
        resolve(serverPort)
      })
    })
    const port = await serverStart
    ensureEventListener()
    return port
  }

  let serverPort = 0

  return {
    async open(sessionID) {
      await regeneratePreview(projectRoot)
      const port = await ensureServer()
      if (closed) throw new Error("La vista de revisión ya está cerrada.")
      const previousToken = sessionToToken.get(sessionID)
      if (previousToken) {
        tokenToSession.delete(previousToken)
        closeSessionClients(sessionID, clients)
      }
      const token = randomBytes(24).toString("hex")
      sessionToToken.set(sessionID, token)
      tokenToSession.set(token, sessionID)
      statusBySession.set(sessionID, "idle")
      const url = `http://127.0.0.1:${port}/open/${token}`
      if (!autoOpen) return { url, browserOpened: false }
      try {
        await launchBrowser(url)
        return { url, browserOpened: true }
      } catch (error) {
        return { url, browserOpened: false, browserError: errorMessage(error) }
      }
    },
    async close() {
      if (closed) return
      closed = true
      eventController.abort()
      for (const client of clients) {
        clearInterval(client.heartbeat)
        client.response.end()
      }
      clients.clear()
      tokenToSession.clear()
      sessionToToken.clear()
      if (serverStart) await serverStart.catch(() => undefined)
      if (!server?.listening) return
      await new Promise<void>((resolve) => server!.close(() => resolve()))
    },
  }
}

function closeSessionClients(sessionID: string, clients: Set<{ sessionID: string; response: ServerResponse; heartbeat: ReturnType<typeof setInterval> }>) {
  for (const client of clients) {
    if (client.sessionID !== sessionID) continue
    clearInterval(client.heartbeat)
    client.response.end()
    clients.delete(client)
  }
}

function setBaseHeaders(response: ServerResponse) {
  response.setHeader("X-Content-Type-Options", "nosniff")
  response.setHeader("Referrer-Policy", "no-referrer")
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
}

function authorizedSession(request: IncomingMessage, tokenToSession: Map<string, string>): string | undefined {
  const cookie = request.headers.cookie?.split(";").map((item) => item.trim()).find((item) => item.startsWith("ds_review="))
  const token = cookie?.slice("ds_review=".length)
  return token ? tokenToSession.get(token) : undefined
}

function writeJson(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" })
  response.end(JSON.stringify(data))
}

function writeText(response: ServerResponse, status: number, text: string) {
  response.writeHead(status, { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" })
  response.end(text)
}

function writeHtml(response: ServerResponse, html: string, policy: string) {
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Security-Policy": policy,
    "Content-Type": "text/html; charset=utf-8",
  })
  response.end(html)
}

function normalizeMessages(input: unknown): ReviewMessage[] {
  if (!Array.isArray(input)) return []
  return input.flatMap<ReviewMessage>((item: any) => {
    if (!item || typeof item !== "object") return []
    if (item.type === "user") return [{ id: String(item.id ?? randomBytes(6).toString("hex")), role: "user" as const, text: clampText(item.text), created: item.time?.created }]
    if (item.type === "synthetic") return [{ id: String(item.id ?? randomBytes(6).toString("hex")), role: "system" as const, text: clampText(item.text), created: item.time?.created }]
    if (item.type !== "assistant") return []
    const parts = Array.isArray(item.content) ? item.content : []
    const text = parts.filter((part: any) => part?.type === "text" && typeof part.text === "string").map((part: any) => part.text).join("\n\n")
    const tools = parts.filter((part: any) => part?.type === "tool").map((part: any) => {
      const status = part.state?.status
      return status === "error" ? `Herramienta ${part.tool ?? ""}: error` : `Herramienta: ${part.tool ?? "ejecutada"}`
    })
    const content = [text, ...tools].filter(Boolean).join("\n\n")
    return content ? [{ id: String(item.id ?? randomBytes(6).toString("hex")), role: "assistant" as const, text: clampText(content), created: item.time?.created }] : []
  }).slice(-100)
}

async function loadReviewCatalog(projectRoot: string): Promise<ReviewCatalog> {
  const manifest = await readManifest(projectRoot)
  const designSystemRoot = resolveInside(projectRoot, DESIGN_SYSTEM_DIR)
  const tokenPath = resolveInside(designSystemRoot, manifest.tokens)
  const tokens = JSON.parse(await readFile(tokenPath, "utf8")) as Record<string, unknown>
  return { manifest, tokens, designSystemRoot }
}

async function resolveReviewReference(catalog: ReviewCatalog, input: unknown): Promise<ResolvedReviewReference | undefined> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined
  const reference = input as Record<string, unknown>
  if (reference.type === "component" || reference.type === "pattern") {
    if (typeof reference.name !== "string" || typeof reference.file !== "string"
      || reference.name.length > 256 || reference.file.length > 512) return undefined
    const records = reference.type === "component" ? catalog.manifest.components : catalog.manifest.patterns
    const record = records.find((item) => item.name === reference.name && item.file === reference.file)
    if (!record) return undefined
    try {
      await readFile(resolveInside(catalog.designSystemRoot, record.file), "utf8")
    } catch {
      return undefined
    }
    return { type: reference.type, name: record.name, file: record.file, tokens: [...record.tokens] }
  }
  if (reference.type === "token") {
    if (typeof reference.path !== "string" || typeof reference.theme !== "string"
      || reference.path.length > 512 || reference.theme.length > 128
      || !catalog.manifest.themes.includes(reference.theme)) return undefined
    const pathParts = reference.path.split(".")
    if (!pathParts.length || pathParts.some((part) => !part || part.trim() !== part)) return undefined
    const themes = catalog.tokens.themes
    let value: unknown = themes && typeof themes === "object" ? (themes as Record<string, unknown>)[reference.theme] : undefined
    for (const part of pathParts) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
      value = (value as Record<string, unknown>)[part]
    }
    if (!["string", "number", "boolean"].includes(typeof value)) return undefined
    return { type: "token", path: reference.path, theme: reference.theme, file: catalog.manifest.tokens, value: String(value) }
  }
  return undefined
}

function promptWithReferences(text: string, references: ResolvedReviewReference[]): string {
  return `${text}\n\nThe user selected these exact elements in the interactive Design System preview. Treat this JSON as stable reference data, read the listed source documents before editing, and do not edit generated preview HTML:\n\n${JSON.stringify(references, null, 2)}\n\nKeep the requested change focused on these selected elements.`
}

function clampText(value: unknown): string {
  if (typeof value !== "string") return ""
  return value.length > 16_000 ? `${value.slice(0, 16_000)}\n\n[Mensaje truncado en la vista de revisión]` : value
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let oversized = false
    request.on("data", (chunk: Buffer | string) => {
      if (oversized) return
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.length
      if (size > MAX_BODY_LENGTH) {
        oversized = true
        reject(new RequestSizeError())
        return
      }
      chunks.push(buffer)
    })
    request.on("end", () => {
      if (!oversized) resolve(Buffer.concat(chunks).toString("utf8"))
    })
    request.on("error", reject)
  })
}

class RequestSizeError extends Error {}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function waitForRetry(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener("abort", finish)
      resolve()
    }
    const timer = setTimeout(finish, 1_000)
    timer.unref()
    signal.addEventListener("abort", finish, { once: true })
  })
}

function launchBrowser(url: string): Promise<void> {
  const command = process.platform === "win32" ? "cmd.exe" : process.platform === "darwin" ? "open" : "xdg-open"
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url]
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true })
    child.once("error", reject)
    child.once("spawn", () => {
      child.unref()
    })
    child.once("exit", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`El navegador del sistema terminó con el código ${code ?? "desconocido"}.`))
    })
    const timeout = setTimeout(() => reject(new Error("El navegador del sistema no respondió a tiempo.")), 5_000)
    timeout.unref()
    child.once("exit", () => clearTimeout(timeout))
    child.once("error", () => clearTimeout(timeout))
  })
}

function renderReviewPage(): { html: string; nonce: string } {
  const nonce = randomBytes(18).toString("base64url")
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Design System Review · OpenCode</title>
<style>
:root{color-scheme:dark;--bg:#111315;--panel:#191c1f;--surface:#202428;--line:#30363b;--text:#edf0f2;--muted:#9ba4aa;--accent:#b6d8c6;--accent-ink:#17241d;--danger:#f3a7a2;font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);height:100vh;overflow:hidden}.app{height:100vh;display:grid;grid-template-rows:56px minmax(0,1fr)}header{display:flex;align-items:center;justify-content:space-between;padding:0 18px;border-bottom:1px solid var(--line);background:#151719}.brand{display:flex;align-items:center;gap:11px;font-weight:650}.mark{width:25px;height:25px;display:grid;place-items:center;border:1px solid #496352;border-radius:8px;color:var(--accent);font-size:13px}.subtitle{color:var(--muted);font-size:12px;font-weight:450}.header-right{display:flex;align-items:center;gap:12px}.state{display:flex;align-items:center;gap:7px;color:var(--muted);font-size:12px}.dot{width:7px;height:7px;border-radius:50%;background:#75c796}.state.working .dot{background:#e6bd76;box-shadow:0 0 0 4px #e6bd7622;animation:pulse 1.2s infinite}@keyframes pulse{50%{opacity:.45}}main{min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 390px}.preview-pane,.chat-pane{min-width:0;min-height:0;display:grid;grid-template-rows:49px minmax(0,1fr)}.preview-pane{border-right:1px solid var(--line)}.pane-toolbar{display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-bottom:1px solid var(--line);background:#17191b}.pane-title{font-size:12px;font-weight:650;letter-spacing:.02em}.tools{display:flex;align-items:center;gap:8px}.button{border:1px solid var(--line);border-radius:7px;background:var(--surface);color:var(--text);padding:6px 10px;font:inherit;font-size:12px;cursor:pointer}.button:hover{border-color:#64736c}.button:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.button.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:650}.button[aria-pressed="true"]{border-color:var(--accent);color:var(--accent)}.button:disabled{opacity:.5;cursor:wait}.frame-wrap{min-height:0;background:#e9e7e3}.frame-wrap iframe{display:block;width:100%;height:100%;border:0;background:white}.chat-pane{grid-template-rows:49px minmax(0,1fr) auto}.chat-heading{display:flex;align-items:center;justify-content:space-between}.session-label{color:var(--muted);font-size:11px;max-width:116px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.messages{min-height:0;overflow:auto;padding:18px 15px 24px;display:flex;flex-direction:column;gap:13px;scrollbar-color:#3b4146 transparent}.empty{margin:auto 8px;color:var(--muted);text-align:center;max-width:260px}.message{border:1px solid var(--line);border-radius:10px;background:var(--panel);padding:10px 11px;max-width:100%}.message.user{background:#202821;border-color:#35483c}.message.system{background:#1c2022;color:#bac3c8}.message-meta{font-size:10px;color:var(--muted);margin-bottom:5px;text-transform:uppercase;letter-spacing:.07em}.message-body{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}.composer{border-top:1px solid var(--line);padding:12px;background:#151719}.composer textarea{resize:vertical;min-height:86px;max-height:220px;width:100%;border:1px solid var(--line);border-radius:8px;background:#101214;color:var(--text);padding:10px;font:inherit;line-height:1.45}.selected-references{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.selected-references:empty{display:none}.reference-chip{display:flex;align-items:center;gap:8px;max-width:100%;border:1px solid #3c5145;border-radius:7px;background:#1c2821;padding:6px 7px 6px 9px}.reference-chip.stale{border-color:#694640;background:#2b201f}.reference-copy{display:grid;min-width:0;gap:1px}.reference-copy strong{font-size:11px;font-weight:600}.reference-copy span{color:var(--muted);font-size:10px;overflow-wrap:anywhere}.reference-remove{flex:none;border:0;background:transparent;color:var(--muted);font-size:16px;line-height:1;cursor:pointer;padding:2px 4px}.reference-remove:hover{color:var(--text)}.selection-help{color:var(--accent);font-size:10px;margin-top:6px}.selection-help[hidden]{display:none}.composer-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px}.composer-hint{font-size:10px;color:var(--muted)}.composer-actions{display:flex;align-items:center;gap:8px}.composer select{max-width:100px;border:1px solid var(--line);border-radius:7px;background:var(--surface);color:var(--muted);padding:6px 7px;font:inherit;font-size:11px}.notice{position:fixed;left:50%;top:68px;transform:translateX(-50%);max-width:min(90vw,600px);padding:9px 13px;border:1px solid #59423f;border-radius:8px;background:#2a201f;color:var(--danger);box-shadow:0 8px 28px #0008;font-size:12px;z-index:3}.notice[hidden]{display:none}@media(max-width:900px){body{height:auto;min-height:100vh;overflow:auto}.app{height:auto;min-height:100vh;grid-template-rows:56px 1fr}main{grid-template-columns:1fr;grid-template-rows:minmax(55vh,1fr) minmax(480px,70vh)}.preview-pane{border-right:0;border-bottom:1px solid var(--line)}.chat-pane{min-height:0}}@media(max-width:520px){header{padding:0 11px}.subtitle{display:none}.header-right .state{font-size:0}.header-right .state .dot{width:8px;height:8px}.pane-toolbar{padding:0 10px}.button{padding:6px 8px}.chat-pane{grid-template-rows:45px minmax(0,1fr) auto}.composer-hint{display:none}}
</style>
</head>
<body><div class="app">
<header><div class="brand"><span class="mark">◈</span><span>Design System Review</span><span class="subtitle">· OpenCode v2</span></div><div class="header-right"><span class="state" id="connection-state"><i class="dot"></i><span id="state-label">Conectando…</span></span></div></header>
<main><section class="preview-pane" aria-label="Vista previa"><div class="pane-toolbar"><span class="pane-title">PREVIEW</span><div class="tools"><button class="button" id="select-mode" type="button" aria-pressed="false">Seleccionar elemento</button><button class="button" id="refresh-preview" type="button">Actualizar preview</button></div></div><div class="frame-wrap"><iframe id="preview" title="Vista previa interactiva del Design System" sandbox="allow-scripts allow-forms"></iframe></div></section>
<section class="chat-pane" aria-label="Conversación de OpenCode"><div class="pane-toolbar chat-heading"><span class="pane-title">CONVERSACIÓN</span><span class="session-label" id="session-label" title="">Sesión</span></div><div class="messages" id="messages" role="log" aria-live="polite" aria-relevant="additions text"></div><form class="composer" id="composer"><textarea id="prompt" maxlength="20000" placeholder="Pide un cambio en el Design System…" aria-label="Mensaje para OpenCode"></textarea><div class="selected-references" id="selected-references" aria-live="polite"></div><div class="selection-help" id="selection-help" hidden>Elige componentes, patrones o tokens en la preview. Puedes adjuntar hasta 8.</div><div class="composer-row"><span class="composer-hint">Intro para enviar · Mayús+Intro para nueva línea</span><div class="composer-actions"><select id="delivery" aria-label="Modo de envío"><option value="steer">Dirigir</option><option value="queue">En cola</option></select><button class="button primary" id="send" type="submit">Enviar</button></div></div></form></section></main><div class="notice" id="notice" role="status" hidden></div></div>
<script nonce="${nonce}">
const messages=document.getElementById('messages'),frame=document.getElementById('preview'),state=document.getElementById('connection-state'),stateLabel=document.getElementById('state-label'),sessionLabel=document.getElementById('session-label'),notice=document.getElementById('notice'),form=document.getElementById('composer'),promptInput=document.getElementById('prompt'),sendButton=document.getElementById('send'),selectModeButton=document.getElementById('select-mode'),selectionHelp=document.getElementById('selection-help'),referenceHolder=document.getElementById('selected-references');let noticeTimer,messageRefreshTimer,selectionMode=false,selectionPort=null;const selectedReferences=[];
function showNotice(text){notice.textContent=text;notice.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>notice.hidden=true,6500)}
function setStatus(value){const working=value==='working';state.classList.toggle('working',working);stateLabel.textContent=working?'OpenCode está trabajando':'Sesión conectada'}
function refreshPreview(){frame.src='/preview?refresh='+Date.now()}
function nearBottom(){return messages.scrollHeight-messages.scrollTop-messages.clientHeight<90}
function addMessage(item){const article=document.createElement('article');article.className='message '+item.role;const meta=document.createElement('div');meta.className='message-meta';meta.textContent=item.role==='user'?'Tú':item.role==='assistant'?'OpenCode':'Sistema';const body=document.createElement('div');body.className='message-body';body.textContent=item.text;article.append(meta,body);messages.append(article)}
async function loadMessages(){const keepBottom=nearBottom();try{const response=await fetch('/api/messages',{cache:'no-store'});const payload=await response.json();if(!response.ok)throw new Error(payload.error||'No se pudo cargar la conversación.');messages.replaceChildren();if(!payload.messages.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='La conversación aparecerá aquí. Puedes pedir cambios y seguir trabajando en OpenCode.';messages.append(empty)}else payload.messages.forEach(addMessage);sessionLabel.textContent='Sesión '+String(payload.sessionID).slice(0,10);sessionLabel.title=payload.sessionID;setStatus(payload.status);if(keepBottom)messages.scrollTop=messages.scrollHeight}catch(error){showNotice(error.message||'No se pudo conectar con OpenCode.')}}
function referenceKey(reference){return reference.type==='token'?'token:'+reference.theme+':'+reference.path:reference.type+':'+reference.file}
function referenceTitle(reference){if(reference.type==='token')return 'Token · '+reference.path;return (reference.type==='pattern'?'Patrón · ':'Componente · ')+reference.name}
function referenceDetail(reference){if(reference.type==='token')return reference.theme+' · '+reference.value;return 'design-system/'+reference.file+(reference.tokens&&reference.tokens.length?' · '+reference.tokens.join(', '):'')}
function renderReferences(){referenceHolder.replaceChildren();for(const item of selectedReferences){const chip=document.createElement('div');chip.className='reference-chip'+(item.stale?' stale':'');const copy=document.createElement('div');copy.className='reference-copy';const title=document.createElement('strong');title.textContent=referenceTitle(item.reference)+(item.stale?' · obsoleto':'');const detail=document.createElement('span');detail.textContent=referenceDetail(item.reference);const remove=document.createElement('button');remove.className='reference-remove';remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Quitar '+referenceTitle(item.reference));remove.addEventListener('click',()=>{const index=selectedReferences.indexOf(item);if(index>=0)selectedReferences.splice(index,1);renderReferences()});copy.append(title,detail);chip.append(copy,remove);referenceHolder.append(chip)}selectionHelp.hidden=!selectionMode}
function setSelectionMode(enabled){selectionMode=enabled;selectModeButton.setAttribute('aria-pressed',String(enabled));selectModeButton.textContent=enabled?'Cancelar selección':'Seleccionar elemento';selectionHelp.hidden=!enabled;if(selectionPort)selectionPort.postMessage({type:'selection-mode',enabled});if(enabled)showNotice('Selecciona componentes, patrones o muestras de tokens en la preview.')}
function connectPreview(){if(selectionPort)selectionPort.close();selectionPort=null;if(typeof MessageChannel==='undefined'||!frame.contentWindow)return;const channel=new MessageChannel();selectionPort=channel.port1;selectionPort.onmessage=event=>{if(selectionMode&&event.data&&event.data.type==='selection')addReference(event.data.reference)};selectionPort.start();frame.contentWindow.postMessage({type:'design-system-review-connect'},'*',[channel.port2]);if(selectionMode)selectionPort.postMessage({type:'selection-mode',enabled:true})}
frame.addEventListener('load',connectPreview);
async function addReference(candidate){if(!selectionMode||!candidate)return;if(selectedReferences.length>=8){showNotice('Puedes adjuntar hasta 8 elementos por mensaje.');return}try{const response=await fetch('/api/reference',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reference:candidate})});const payload=await response.json();if(!response.ok)throw new Error(payload.error||'El elemento ya no está disponible.');const reference=payload.reference,key=referenceKey(reference);if(selectedReferences.some(item=>referenceKey(item.reference)===key)){showNotice('Ese elemento ya está adjunto.');return}selectedReferences.push({reference,stale:false});renderReferences()}catch(error){showNotice(error.message||'No se pudo añadir el elemento seleccionado.')}}
selectModeButton.addEventListener('click',()=>{if(!selectionMode&&typeof MessageChannel==='undefined'){showNotice('Este navegador no admite la selección contextual.');return}setSelectionMode(!selectionMode)});
form.addEventListener('submit',async event=>{event.preventDefault();const draft=promptInput.value,text=draft.trim();if(!text)return;sendButton.disabled=true;const submittedReferences=selectedReferences.map(item=>item.reference),submittedKeys=new Set(submittedReferences.map(referenceKey));try{const response=await fetch('/api/prompt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,delivery:document.getElementById('delivery').value,references:submittedReferences})});const payload=await response.json();if(response.status===409){const staleKeys=new Set((payload.staleReferences||[]).map(referenceKey));for(const item of selectedReferences)if(staleKeys.has(referenceKey(item.reference)))item.stale=true;renderReferences()}if(!response.ok)throw new Error(payload.error||'No se pudo enviar el mensaje.');if(promptInput.value===draft)promptInput.value='';for(let index=selectedReferences.length-1;index>=0;index--)if(submittedKeys.has(referenceKey(selectedReferences[index].reference)))selectedReferences.splice(index,1);renderReferences();setStatus('working');await loadMessages();promptInput.focus()}catch(error){showNotice(error.message||'No se pudo enviar el mensaje.')}finally{sendButton.disabled=false}});
promptInput.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();form.requestSubmit()}});document.getElementById('refresh-preview').addEventListener('click',async()=>{try{const response=await fetch('/api/preview',{method:'POST'});const payload=await response.json();if(!response.ok)throw new Error(payload.error||'No se pudo regenerar la preview.');refreshPreview();showNotice('Preview regenerada.')}catch(error){showNotice(error.message||'No se pudo regenerar la preview.')}});
function scheduleMessages(){clearTimeout(messageRefreshTimer);messageRefreshTimer=setTimeout(loadMessages,180)}refreshPreview();loadMessages();const events=new EventSource('/api/events');events.addEventListener('open',()=>{loadMessages();refreshPreview()});events.addEventListener('update',event=>{const update=JSON.parse(event.data);setStatus(update.status);scheduleMessages()});events.addEventListener('sync',event=>{const update=JSON.parse(event.data);setStatus(update.status);loadMessages();refreshPreview()});events.addEventListener('preview',()=>{refreshPreview();scheduleMessages()});events.addEventListener('review-error',event=>{const data=JSON.parse(event.data);showNotice(data.message||'Se produjo un error al actualizar la preview.')});events.onerror=()=>{stateLabel.textContent='Reconectando…'};
</script></body></html>`
  return { html, nonce }
}
