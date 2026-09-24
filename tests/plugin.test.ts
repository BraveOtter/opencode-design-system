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
    const hooks = new Map<string, (event: any) => void>()
    const sentPrompts: any[] = []
    let namespace = ""
    const fakeContext = {
      location: { directory: root, project: { canonical: root } },
      session: {
        hook: async (name: string, callback: (event: any) => void) => hooks.set(name, callback),
        prompt: async (input: any) => sentPrompts.push(input),
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
    }
    await (plugin as unknown as { setup(context: unknown): Promise<unknown> }).setup(fakeContext)

    expect([...commands.keys()]).toEqual(expect.arrayContaining([
      "design-system", "design-system/update", "design-system/preview", "design-system/check", "design-screen",
    ]))
    expect([...tools.keys()]).toEqual(expect.arrayContaining([
      "design_system_create", "design_system_read", "design_system_analyze", "design_system_update",
      "design_system_preview", "design_system_check", "design_system_screen_spec",
    ]))
    expect(hooks.has("context")).toBe(true)

    await commands.get("design-system/update").execute({
      sessionID: "ses_test",
      prompt: { text: "Compact the controls" },
      delivery: "steer",
    })
    expect(sentPrompts[0].sessionID).toBe("ses_test")
    expect(sentPrompts[0].text).toContain("Compact the controls")
    expect(sentPrompts[0].text).toContain("design_system_update")

    const contextHook = hooks.get("context")!
    const systemEvent = { system: [] as Array<{ type: string; text: string }> }
    contextHook(systemEvent)
    expect(systemEvent.system).toHaveLength(0)
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
    expect(existsSync(path.join(root, ".opencode"))).toBe(false)
    const readResult = JSON.parse((await tools.get("design_system_read").execute({ task: "Button action" })).content)
    expect(readResult.components.map((item: { name: string }) => item.name)).toContain("Button")
    expect(readResult.excluded).toContain("Input")
    expect(readResult.tokens.themes.dark.color.accent.primary).toBe("#78b99b")
    contextHook(systemEvent)
    expect(systemEvent.system).toHaveLength(1)
    expect(systemEvent.system[0]!.text).toContain("Follow the Design System guidance in AGENTS.md")
    expect(systemEvent.system[0]!.text).toContain("read only the relevant tokens")
  })
})
