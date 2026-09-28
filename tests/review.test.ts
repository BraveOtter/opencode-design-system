import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createDesignSystem } from "../src/generator.js"
import { createReviewService } from "../src/review.js"

const temporaryDirectories: string[] = []
const reviewServices: Array<{ close(): Promise<void> }> = []

afterEach(async () => {
  await Promise.all(reviewServices.splice(0).map((service) => service.close()))
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("local Design System review workspace", () => {
  it("serves the preview and same-session conversation through a loopback-only authenticated view", async () => {
    const root = await createFixture()
    const messages = [
      { id: "user-1", type: "user", text: "Make the buttons more compact.", time: { created: 1 } },
      { id: "assistant-1", type: "assistant", content: [{ type: "text", text: "I will update the button tokens." }], time: { created: 2, completed: 3 } },
    ]
    const session = {
      context: vi.fn(async () => messages),
      prompt: vi.fn(async (_input: { sessionID: string; text: string; delivery: "steer" | "queue" }) => ({ id: "inbox-1" })),
    }
    const events = makeEventSource()
    const service = createReviewService({
      projectRoot: root,
      context: { session, event: events } as never,
      autoOpen: false,
    })
    reviewServices.push(service)

    const opened = await service.open("ses_local")
    expect(opened.browserOpened).toBe(false)
    const invite = await fetch(opened.url, { redirect: "manual" })
    expect(invite.status).toBe(303)
    const cookie = invite.headers.get("set-cookie")?.split(";")[0]
    expect(cookie).toMatch(/^ds_review=[a-f0-9]{48}$/)

    const origin = new URL(opened.url).origin
    const page = await fetch(`${origin}/`, { headers: { cookie: cookie! } })
    const html = await page.text()
    expect(page.status).toBe(200)
    expect(page.headers.get("content-security-policy")).toContain("script-src 'nonce-")
    expect(html).toContain("CONVERSACIÓN")
    expect(html).toContain('sandbox="allow-scripts allow-forms"')
    expect(html).toContain("id=\"select-mode\"")
    expect(html).toContain("selected-references")
    const appScript = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)?.[1]
    expect(appScript).toBeDefined()
    expect(() => new Function(appScript!)).not.toThrow()

    const unauthorized = await fetch(`${origin}/api/messages`)
    expect(unauthorized.status).toBe(401)
    const conversation = await fetch(`${origin}/api/messages`, { headers: { cookie: cookie! } })
    const data = await conversation.json() as { sessionID: string; messages: Array<{ role: string; text: string }> }
    expect(data.sessionID).toBe("ses_local")
    expect(data.messages.map((item) => item.role)).toEqual(["user", "assistant"])
    expect(data.messages[0]?.text).toBe("Make the buttons more compact.")

    const preview = await fetch(`${origin}/preview`, { headers: { cookie: cookie! } })
    expect(preview.status).toBe(200)
    const previewHtml = await preview.text()
    expect(previewHtml).toContain("Test system")
    expect(previewHtml).toContain('data-review-select="component"')
    expect(previewHtml).toContain('data-review-file="components/button.md"')
    expect(previewHtml).toContain('data-review-select="pattern"')
    expect(previewHtml).toContain("card.dataset.reviewSelect='token'")

    const blockedPrompt = await fetch(`${origin}/api/prompt`, {
      method: "POST",
      headers: { cookie: cookie!, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Do not accept cross-origin requests" }),
    })
    expect(blockedPrompt.status).toBe(403)

    const componentResponse = await fetch(`${origin}/api/reference`, {
      method: "POST",
      headers: { cookie: cookie!, origin, "Content-Type": "application/json" },
      body: JSON.stringify({ reference: { type: "component", name: "Button", file: "components/button.md" } }),
    })
    const componentPayload = await componentResponse.json() as { reference: { type: string; name: string; file: string; tokens: string[] } }
    expect(componentResponse.status).toBe(200)
    expect(componentPayload.reference).toEqual({ type: "component", name: "Button", file: "components/button.md", tokens: ["color.accent.primary"] })

    const invalidReference = await fetch(`${origin}/api/reference`, {
      method: "POST",
      headers: { cookie: cookie!, origin, "Content-Type": "application/json" },
      body: JSON.stringify({ reference: { type: "component", name: "Button", file: "../../README.md" } }),
    })
    expect(invalidReference.status).toBe(409)

    const patternResponse = await fetch(`${origin}/api/reference`, {
      method: "POST",
      headers: { cookie: cookie!, origin, "Content-Type": "application/json" },
      body: JSON.stringify({ reference: { type: "pattern", name: "Account form", file: "patterns/account-form.md" } }),
    })
    const patternPayload = await patternResponse.json() as { reference: { type: string; name: string; file: string } }
    expect(patternResponse.status).toBe(200)
    expect(patternPayload.reference.file).toBe("patterns/account-form.md")

    const tokenResponse = await fetch(`${origin}/api/reference`, {
      method: "POST",
      headers: { cookie: cookie!, origin, "Content-Type": "application/json" },
      body: JSON.stringify({ reference: { type: "token", path: "color.accent.primary", theme: "light" } }),
    })
    const tokenPayload = await tokenResponse.json() as { reference: { type: string; path: string; theme: string; value: string } }
    expect(tokenResponse.status).toBe(200)
    expect(tokenPayload.reference.value).toBe("#276f55")

    const prompt = await fetch(`${origin}/api/prompt`, {
      method: "POST",
      headers: { cookie: cookie!, origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Compact the controls",
        delivery: "queue",
        references: [componentPayload.reference, patternPayload.reference, tokenPayload.reference],
      }),
    })
    expect(prompt.status).toBe(202)
    expect(session.prompt).toHaveBeenCalledOnce()
    const sentPrompt = session.prompt.mock.calls[0]![0] as { sessionID: string; text: string; delivery: string }
    expect(sentPrompt.sessionID).toBe("ses_local")
    expect(sentPrompt.text).toContain("Compact the controls")
    expect(sentPrompt.text).toContain('"file": "components/button.md"')
    expect(sentPrompt.text).toContain('"file": "patterns/account-form.md"')
    expect(sentPrompt.text).toContain('"path": "color.accent.primary"')
    expect(sentPrompt.text).toContain('"value": "#276f55"')
    expect(sentPrompt.delivery).toBe("queue")

    const tokenPath = path.join(root, "design-system", "tokens.json")
    const tokens = JSON.parse(await readFile(tokenPath, "utf8")) as { themes: { light: { color: { accent: { primary?: string } } } } }
    delete tokens.themes.light.color.accent.primary
    await writeFile(tokenPath, JSON.stringify(tokens, null, 2))
    const refreshed = await fetch(`${origin}/api/preview`, {
      method: "POST",
      headers: { cookie: cookie!, origin },
    })
    expect(refreshed.status).toBe(200)
    const stalePrompt = await fetch(`${origin}/api/prompt`, {
      method: "POST",
      headers: { cookie: cookie!, origin, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Change this", references: [tokenPayload.reference] }),
    })
    expect(stalePrompt.status).toBe(409)
    expect(session.prompt).toHaveBeenCalledOnce()
  })

  it("regenerates the preview when the linked OpenCode session becomes idle", async () => {
    const root = await createFixture()
    const session = { context: vi.fn(async () => []), prompt: vi.fn(async () => ({})) }
    const events = makeEventSource()
    const service = createReviewService({ projectRoot: root, context: { session, event: events } as never, autoOpen: false })
    reviewServices.push(service)
    const opened = await service.open("ses_refresh")
    const origin = new URL(opened.url).origin
    const invite = await fetch(opened.url, { redirect: "manual" })
    const cookie = invite.headers.get("set-cookie")?.split(";")[0]!
    const stream = await fetch(`${origin}/api/events`, { headers: { cookie } })
    const reader = stream.body!.getReader()
    await reader.read()

    const tokenPath = path.join(root, "design-system", "tokens.json")
    const tokens = JSON.parse(await readFile(tokenPath, "utf8")) as { themes: { light: { color: { accent: { primary: string } } } } }
    tokens.themes.light.color.accent.primary = "#123abc"
    await writeFile(tokenPath, JSON.stringify(tokens, null, 2))
    events.emit({ type: "session.idle", data: { sessionID: "ses_refresh" } })

    let output = ""
    const deadline = Date.now() + 4_000
    while (!output.includes("event: preview") && Date.now() < deadline) {
      const read = await Promise.race([
        reader.read(),
        new Promise<ReadableStreamReadResult<Uint8Array>>((resolve) => setTimeout(() => resolve({ done: false, value: new Uint8Array() }), 150)),
      ])
      output += new TextDecoder().decode(read.value)
    }
    expect(output).toContain("event: preview")

    const preview = await fetch(`${origin}/preview`, { headers: { cookie } })
    expect(await preview.text()).toContain("#123abc")
    await reader.cancel()
  })
})

async function createFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "opencode-review-"))
  temporaryDirectories.push(root)
  await createDesignSystem(root, {
    name: "Test system",
    description: "A local review fixture.",
    tokens: { schemaVersion: "1.0.0", themes: { light: { color: { accent: { primary: "#276f55" }, text: { primary: "#111111" } }, radius: { control: "4px" } } } },
    foundations: "# Design\n\nCompact and calm.",
    components: [{ name: "Button", purpose: "Runs an action.", tokens: ["color.accent.primary"] }],
    patterns: [{ name: "Account form", purpose: "Collects account details.", tokens: ["color.accent.primary"] }],
  })
  return root
}

function makeEventSource() {
  const pending: unknown[] = []
  const listeners = new Set<() => void>()
  return {
    emit(event: unknown) {
      pending.push(event)
      for (const wake of listeners) wake()
    },
    async *subscribe({ signal }: { signal: AbortSignal }) {
      while (!signal.aborted) {
        if (pending.length) {
          yield pending.shift()
          continue
        }
        await new Promise<void>((resolve) => {
          const wake = () => {
            listeners.delete(wake)
            signal.removeEventListener("abort", wake)
            resolve()
          }
          listeners.add(wake)
          signal.addEventListener("abort", wake, { once: true })
        })
      }
    },
  }
}
