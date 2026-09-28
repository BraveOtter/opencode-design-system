import { existsSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import plugin from "../src/index.js"
import { createDesignSystem } from "../src/generator.js"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("OpenCode v2 plugin contract", () => {
  it("registers V2 commands and tools, and points UI agents to portable project guidance", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "opencode-design-plugin-"))
    temporaryDirectories.push(root)
    const commands = new Map<string, any>()
    const tools = new Map<string, any>()
    const skills = new Map<string, any>()
    const hooks = new Map<string, (event: any) => void>()
    const sentPrompts: any[] = []
    let namespace = ""
    const fakeContext = {
      location: { directory: root, project: { canonical: root } },
      options: {},
      session: {
        hook: async (name: string, callback: (event: any) => void) => hooks.set(name, callback),
        prompt: async (input: any) => sentPrompts.push(input),
      },
      event: {
        subscribe: async function* ({ signal }: { signal: AbortSignal }) {
          await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }))
        },
      },
      command: {
        transform: async (register: (editor: any) => void) => register({ add: (definition: any) => commands.set(definition.name, definition) }),
      },
      tool: {
        transform: async (register: (editor: any) => void) => register({
          namespace: (definition: { name: string }) => { namespace = definition.name },
          add: (definition: any) => tools.set(`${namespace}_${definition.name}`, definition),
        }),
      },
      skill: {
        transform: async (register: (editor: any) => void) => register({ add: (skill: any) => skills.set(skill.id, skill) }),
      },
    }
    const cleanup = await (plugin as unknown as { setup(context: unknown): Promise<() => Promise<void>> }).setup(fakeContext)

    expect([...commands.keys()]).toEqual(expect.arrayContaining([
      "design-system", "design-system/update", "design-system/preview", "design-system/check", "design-screen",
      "design-system/review",
    ]))
    expect([...tools.keys()]).toEqual(expect.arrayContaining([
      "design_system_create", "design_system_read", "design_system_analyze", "design_system_update",
      "design_system_preview", "design_system_check", "design_system_screen_spec",
    ]))
    expect([...skills.keys()]).toEqual([
      "opencode-design-visual-direction",
      "opencode-design-interface-craft",
      "opencode-design-token-accessibility",
    ])
    expect([...skills.values()].every((skill) => skill.autoinvoke === true)).toBe(true)
    expect(skills.get("opencode-design-token-accessibility").content).toContain("WCAG 2.2 Level AA")
    expect(hooks.has("context")).toBe(true)

    await commands.get("design-system/update").execute({
      sessionID: "ses_test",
      prompt: { text: "Compact the controls" },
      delivery: "steer",
    })
    expect(sentPrompts[0].sessionID).toBe("ses_test")
    expect(sentPrompts[0].text).toContain("Compact the controls")
    expect(sentPrompts[0].text).toContain("design_system_update")
    expect(sentPrompts[0].text).toContain("opencode-design-visual-direction")
    expect(sentPrompts[0].text).toContain("opencode-design-token-accessibility")

    const contextHook = hooks.get("context")!
    const systemEvent = { system: [] as Array<{ type: string; text: string }> }
    contextHook(systemEvent)
    expect(systemEvent.system).toHaveLength(1)
    expect(systemEvent.system[0]!.text).toContain("opencode-design-interface-craft")
    await createDesignSystem(root, {
      name: "Test system",
      description: "A minimal test system.",
      tokens: { schemaVersion: "1.0.0", themes: {
        light: { color: { accent: { primary: "#276f55" }, text: { primary: "#111111" } }, radius: { control: "4px" } },
        dark: { color: { accent: { primary: "#78b99b" }, text: { primary: "#ffffff" } }, radius: { control: "4px" } },
      } },
      foundations: "# Design\n\nCompact and calm.",
      components: [
        { name: "Button", purpose: "Runs an action.", tokens: ["color.accent.primary", "radius.control"] },
        { name: "Input", purpose: "Collects a value.", tokens: ["color.text.primary", "radius.control"] },
      ],
      patterns: [],
    })
    try {
      await commands.get("design-system/review").execute({ sessionID: "ses_test" })
      expect(sentPrompts).toHaveLength(2)
      expect(sentPrompts[1].text).toMatch(/Review URL: http:\/\/127\.0\.0\.1:\d+\/open\/[a-f0-9]{48}/)
      expect(sentPrompts[1].text).toContain("clickable Markdown link")
      expect(sentPrompts[1].text).toContain("Do not open it with browser tools")
      expect(sentPrompts[1].text).not.toMatch(/español|Spanish/i)
      expect(sentPrompts[1].delivery).toBe("steer")
    } finally {
      await cleanup()
    }
    await commands.get("design-system/preview").execute({
      sessionID: "ses_test",
      prompt: { text: "Refresh the preview" },
      delivery: "steer",
    })
    expect(sentPrompts[2].text).toContain("Design a bespoke, self-contained interactive showcase")
    expect(sentPrompts[2].text).toContain("Do not reproduce the generic dashboard template")
    expect(sentPrompts[2].text).toContain("Run design_system_preview without source after editing")
    expect(sentPrompts[2].text).toContain("Do not edit generated preview/index.html as source")
    expect(sentPrompts[2].text).toContain("User request:\n\nRefresh the preview")
    expect(sentPrompts[2].text).toContain("opencode-design-visual-direction")
    expect(sentPrompts[2].text).toContain("opencode-design-interface-craft")
    expect(sentPrompts[2].text).toContain("opencode-design-token-accessibility")
    expect(existsSync(path.join(root, ".opencode"))).toBe(false)
    expect(existsSync(path.join(root, ".opencode", "skills"))).toBe(false)
    expect(existsSync(path.join(root, "skills"))).toBe(false)
    const readResult = JSON.parse((await tools.get("design_system_read").execute({ task: "Button action" })).content)
    expect(readResult.components.map((item: { name: string }) => item.name)).toContain("Button")
    expect(readResult.excluded).toContain("Input")
    expect(readResult.tokens.themes.dark.color.accent.primary).toBe("#78b99b")
    const previewSource = '<!doctype html><html><head><!-- opencode-design-system:theme-tokens --></head><body><main><h1>Custom test scene</h1></main></body></html>'
    const published = JSON.parse((await tools.get("design_system_preview").execute({ source: previewSource })).content)
    expect(published.mode).toBe("authored")
    const refreshed = JSON.parse((await tools.get("design_system_preview").execute({})).content)
    expect(refreshed.mode).toBe("authored")
    systemEvent.system.length = 0
    contextHook(systemEvent)
    expect(systemEvent.system).toHaveLength(2)
    expect(systemEvent.system[1]!.text).toContain("Follow the Design System guidance in AGENTS.md")
    expect(systemEvent.system[1]!.text).toContain("read only the relevant tokens")
  })
})
