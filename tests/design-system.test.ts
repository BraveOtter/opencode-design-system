import { existsSync } from "node:fs"
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createDesignSystem, regeneratePreview } from "../src/generator.js"
import { resolveInside } from "../src/paths.js"
import { analyzeProject, checkProject } from "../src/project-analysis.js"
import { saveScreenSpec } from "../src/screen.js"
import { updateDesignSystem } from "../src/update.js"
import type { CreateInput } from "../src/types.js"

const temporaryDirectories: string[] = []
const execFileAsync = promisify(execFile)

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("Design System end-to-end flow", () => {
  it("analyzes existing UI read-only, creates a portable system, designs a screen, then updates token dependents and preview", async () => {
    const root = await projectFixture()
    const appCss = await readFile(path.join(root, "src", "styles.css"), "utf8")

    const analysis = await analyzeProject(root)
    expect(analysis.readOnly).toBe(true)
    expect(analysis.frameworks).toContain("react")
    expect(analysis.probableInconsistencies.join(" ")).toMatch(/radii are close/i)
    expect(await readFile(path.join(root, "src", "styles.css"), "utf8")).toBe(appCss)

    const created = await createDesignSystem(root, fixtureInput())
    expect(created.manifest.status).toBe("draft")
    expect(created.manifest.source.type).toBe("existing-project")
    expect(created.manifest.components.map((item) => item.name)).toContain("Button")
    expect(await readFile(path.join(root, ".opencode", "agents", "design-system-designer.md"), "utf8")).toBe("user-owned agent\n")
    expect(await readdir(path.join(root, ".opencode", "agents"))).toEqual(["design-system-designer.md"])
    expect(existsSync(path.join(root, ".opencode", "commands"))).toBe(false)
    expect(existsSync(path.join(root, ".opencode", "skills"))).toBe(false)

    const agents = await readFile(path.join(root, "AGENTS.md"), "utf8")
    expect(agents).toContain("Existing instructions")
    expect(agents).toContain("<!-- opencode-design-system:start -->")
    expect(agents).toContain("any coding agent can use the Design System without this plugin")
    expect(agents).toContain("design-system/manifest.json")

    const brief = await saveScreenSpec(root, "User Management", "Purpose: administer team access.\n\nLayout: sidebar, page header, filters, and a responsive users table.\n\nInteractions: invite, edit role, confirm destructive actions.")
    expect(brief.file).toBe("design-system/screens/user-management.md")
    expect(brief.hasDesignSystem).toBe(true)

    const update = await updateDesignSystem(root, {
      request: "Make control and card corners more square.",
      tokenUpdates: [
        { path: "radius.control", value: "4px", reason: "Tighter, less rounded controls." },
        { path: "radius.card", value: "5px", reason: "Keep surfaces aligned with the compact corner language." },
      ],
      componentUpdates: [{ name: "Card", content: `# Card

## Purpose
Groups related operational information in a compact surface.

## Variants
- default
- interactive

## Tokens
- \`color.surface.raised\`
- \`radius.card\`
- \`elevation.surface\`

## States
- default
- focus
- hover

## Behavior
Use the compact semantic card radius; do not add local corner overrides.

## Accessibility
Keep interactive card content keyboard reachable and name actions explicitly.

## Responsive
Cards reflow to the available column width.

## Use when
Content belongs together.

## Avoid when
It does not need a distinct surface.

## Related components
- Button
` }],
      preferenceUpdates: [{ key: "corners", value: "nearly-square", explicit: true }],
      foundationUpdate: "Use restrained radii: controls at 4px and cards at 5px; do not introduce pill-shaped surfaces.",
      decision: "The user asked for visibly straighter corners. Update the semantic control and card tokens across both themes; keep pill shapes reserved for compact status tags.",
      impact: "minor",
    })

    expect(update.previousVersion).toBe("0.1.0")
    expect(update.version).toBe("0.2.0")
    expect(update.affectedComponents).toEqual(expect.arrayContaining(["Button", "Input", "Card"]))
    expect(update.affectedPatterns).toContain("Form")
    expect(update.updatedDocuments).toContain("design-system/components/card.md")
    expect(update.regenerated).toContain("design-system/preview/index.html")

    const tokens = JSON.parse(await readFile(path.join(root, "design-system", "tokens.json"), "utf8"))
    expect(tokens.themes.light.radius.control).toBe("4px")
    expect(tokens.themes.dark.radius.control).toBe("4px")
    const manifest = JSON.parse(await readFile(path.join(root, "design-system", "manifest.json"), "utf8"))
    expect(manifest.designSystemVersion).toBe("0.2.0")
    expect(manifest.status).toBe("draft")
    expect(await readFile(path.join(root, "design-system", "components", "card.md"), "utf8")).toContain("do not add local corner overrides")
    const guidelines = await readFile(path.join(root, "design-system", "AI-GUIDELINES.md"), "utf8")
    expect(guidelines).toContain("nearly-square")
    expect(guidelines).toContain("no-gradients")
    const portableRun = await execFileAsync(process.execPath, [path.join(root, "design-system", "tools", "generate-preview.mjs")], { cwd: root })
    expect(portableRun.stdout).toContain("Generated design-system/preview/index.html")
    const preview = await readFile(path.join(root, "design-system", "preview", "index.html"), "utf8")
    expect(preview).toContain("Toggle theme")
    expect(preview).toContain("role=\"dialog\"")
    expect(preview).toContain("setTheme")
    expect(preview).toContain("4px")
    expect(await readFile(path.join(root, "src", "styles.css"), "utf8")).toBe(appCss)

    const check = await checkProject(root)
    expect(check.checkedFiles).toBeGreaterThan(0)
    expect(check.warnings.some((warning) => warning.includes("#738292"))).toBe(true)
    expect(check.warnings.some((warning) => warning.includes("border-radius 7px"))).toBe(true)
  })

  it("refuses to overwrite an existing design-system directory or escape the project root", async () => {
    const root = await projectFixture()
    await mkdir(path.join(root, "design-system"), { recursive: true })
    await writeFile(path.join(root, "design-system", "notes.md"), "keep this\n")
    await expect(createDesignSystem(root, fixtureInput())).rejects.toThrow(/contains user files/)
    expect(await readFile(path.join(root, "design-system", "notes.md"), "utf8")).toBe("keep this\n")
    expect(() => resolveInside(root, "../secret.txt")).toThrow(/escapes/)
  })

  it("uses semantic tokens safely in preview markup and rejects updates to unknown paths", async () => {
    const root = await projectFixture()
    const input = fixtureInput()
    input.name = "Ops <script>alert(1)</script>"
    ;(input.tokens.themes as Record<string, Record<string, unknown>>).light["unsafe-preview-test"] = "</script><script>alert(1)</script>"
    await createDesignSystem(root, input)
    const preview = await readFile(path.join(root, "design-system", "preview", "index.html"), "utf8")
    expect(preview).toContain("&lt;script&gt;")
    expect(preview).not.toContain("</script><script>alert(1)</script>")
    await expect(updateDesignSystem(root, {
      request: "Add an unknown token",
      tokenUpdates: [{ path: "radius.unconfigured", value: "99px" }],
      decision: "test",
      impact: "major",
    })).rejects.toThrow(/does not exist/)
  })

  it("supports reviewed token/component/pattern additions and enforces a MINOR bump", async () => {
    const root = await projectFixture()
    await createDesignSystem(root, fixtureInput())
    const result = await updateDesignSystem(root, {
      request: "Add an informational status token and a reusable inline-code component/filter pattern.",
      tokenUpdates: [],
      tokenAdds: [{ path: "color.status.info", values: { light: "#276f91", dark: "#78b9dc" }, reason: "Use a distinct non-error informational status." }],
      newComponents: [{ name: "Inline Code", purpose: "Displays a short code value within prose.", tokens: ["color.status.info", "radius.control"], states: ["default", "focus"] }],
      newPatterns: [{ name: "Filter Bar", purpose: "Combines search and status filters above a data collection.", composition: ["Input", "Select", "Button"], tokens: ["spacing.md", "color.status.info"] }],
      decision: "The user approved a semantic information color and reusable UI documentation for inline code and filters.",
      impact: "patch",
    })

    expect(result.impact).toBe("minor")
    expect(result.version).toBe("0.2.0")
    expect(result.addedTokens).toContain("color.status.info")
    expect(result.addedComponents).toContain("Inline Code")
    expect(result.addedPatterns).toContain("Filter Bar")
    expect(result.affectedComponents).toContain("Inline Code")
    expect(result.affectedPatterns).toContain("Filter Bar")
    const preview = await readFile(path.join(root, "design-system", "preview", "index.html"), "utf8")
    expect(preview).toContain("Inline Code")
    expect(preview).toContain("Filter Bar")
    expect(JSON.parse(await readFile(path.join(root, "design-system", "tokens.json"), "utf8")).themes.dark.color.status.info).toBe("#78b9dc")
  })
})

async function projectFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "opencode-design-system-"))
  temporaryDirectories.push(root)
  await mkdir(path.join(root, "src"), { recursive: true })
  await mkdir(path.join(root, ".opencode", "agents"), { recursive: true })
  await writeFile(path.join(root, "AGENTS.md"), "# Existing instructions\n\n- Keep the current product copy.\n")
  await writeFile(path.join(root, "package.json"), JSON.stringify({ dependencies: { react: "^19.0.0", "@vitejs/plugin-react": "^4.0.0" } }))
  await writeFile(path.join(root, ".opencode", "agents", "design-system-designer.md"), "user-owned agent\n")
  await writeFile(path.join(root, "src", "styles.css"), `:root {
  --brand: #276f55;
  --text-muted: #738292;
}
.button { color: #276f55; border-radius: 8px; min-height: 38px; }
.button-compact { border-radius: 7px; }
.card { border-radius: 10px; padding: 16px; }
`)
  await writeFile(path.join(root, "src", "Button.tsx"), "export function Button() { return null }\n")
  return root
}

function fixtureInput(): CreateInput {
  return {
    name: "Fieldnote Console",
    description: "A compact operations console with muted green accents and clear information hierarchy.",
    sourceType: "existing-project",
    evidence: ["src/styles.css contains a muted-green brand color.", "Three close button/card radii were found; normalized only after user confirmation."],
    status: "draft",
    foundations: `# Design philosophy

Minimal, information-dense enterprise UI with quiet surfaces and direct actions.

## Color
Use muted green for primary actions. Keep text and data contrast clear.

## Shape
Use restrained corner rounding; avoid decorative pill shapes.

## Accessibility
Provide visible keyboard focus and do not encode status by color alone.

## Responsive
Collapse navigation and allow tables to scroll horizontally on narrow screens.`,
    preferences: [
      { key: "no-gradients", value: true, explicit: true, rationale: "The user explicitly asked to avoid gradients." },
      { key: "density", value: "compact", explicit: true },
    ],
    tokens: {
      schemaVersion: "1.0.0",
      themes: {
        light: {
          color: {
            surface: { base: "#f6f8f7", raised: "#ffffff" },
            text: { primary: "#17211f", secondary: "#65726d" },
            accent: { primary: "#276f55", subtle: "#e5f0eb" },
            border: { subtle: "#dbe2de", strong: "#9aa9a1" },
            status: { danger: "#b83d48" },
            focus: { ring: "#79b8a0" },
            onAccent: "#ffffff",
          },
          spacing: { xs: "4px", sm: "8px", md: "16px", lg: "24px" },
          radius: { control: "8px", card: "10px", dialog: "12px", tag: "4px" },
          typography: { fontFamily: { sans: "Inter, sans-serif" }, fontSize: { body: "16px", small: "14px" } },
          elevation: { surface: "0 1px 2px rgba(20,40,30,.05)", dialog: "0 18px 60px rgba(0,0,0,.2)" },
          breakpoints: { compact: "640px", wide: "1024px" },
        },
        dark: {
          color: {
            surface: { base: "#111a17", raised: "#1a2520" },
            text: { primary: "#edf3ef", secondary: "#aab7b0" },
            accent: { primary: "#72b69a", subtle: "#223b30" },
            border: { subtle: "#33413a", strong: "#52635a" },
            status: { danger: "#f18189" },
            focus: { ring: "#99d0b6" },
            onAccent: "#10251b",
          },
          spacing: { xs: "4px", sm: "8px", md: "16px", lg: "24px" },
          radius: { control: "8px", card: "10px", dialog: "12px", tag: "4px" },
          typography: { fontFamily: { sans: "Inter, sans-serif" }, fontSize: { body: "16px", small: "14px" } },
          elevation: { surface: "0 1px 2px rgba(0,0,0,.2)", dialog: "0 18px 60px rgba(0,0,0,.5)" },
          breakpoints: { compact: "640px", wide: "1024px" },
        },
      },
    },
    components: [
      { name: "Button", purpose: "Triggers an immediate, clearly labeled action.", variants: ["primary", "secondary", "danger"], sizes: ["small", "medium", "large"], tokens: ["color.accent.primary", "radius.control", "spacing.md"], states: ["default", "hover", "active", "focus", "disabled", "loading"], accessibility: "Use a native button and preserve visible focus." },
      { name: "Input", purpose: "Collects one labeled value and provides validation feedback.", variants: ["default", "error", "disabled"], sizes: ["medium"], tokens: ["color.text.primary", "radius.control", "spacing.md"], states: ["default", "focus", "disabled", "error", "success"] },
      { name: "Card", purpose: "Groups related operational information.", variants: ["default", "interactive"], tokens: ["color.surface.raised", "radius.card", "elevation.surface"] },
    ],
    patterns: [{ name: "Form", purpose: "Collects related data with concise labels and recoverable validation.", composition: ["Input", "Button"], tokens: ["spacing.md", "color.status.danger", "radius.control"] }],
  }
}
