import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import type { ComponentDefinition, CreateInput, DesignSystemManifest, PatternDefinition, Preference } from "./types.js"
import { DESIGN_SYSTEM_DIR, resolveInside, slugify } from "./paths.js"
import { aiGuidelines, componentMarkdown, DESIGNER_AGENT, PORTABLE_SKILL, projectAgentsBlock, SCREEN_AGENT, patternMarkdown } from "./content.js"
import { atomicWrite, fileExists, readJson, readText as readFileText, updateManagedBlock, writeIfAbsent } from "./io.js"
import { manifestSchema, tokensSchema, validateTokens } from "./schema.js"
import { createPreviewHtml } from "./preview.js"

const SCHEMA_VERSION = "1.0.0"
const INITIAL_VERSION = "0.1.0"

export interface CreateResult {
  success: true
  manifest: DesignSystemManifest
  files: string[]
  conflicts: string[]
}

export async function createDesignSystem(root: string, input: CreateInput): Promise<CreateResult> {
  validateCreateInput(input)
  const target = resolveInside(root, DESIGN_SYSTEM_DIR)
  let existingEntries: string[] = []
  try {
    existingEntries = await readdir(target)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  if (existingEntries.length > 0) {
    if (await fileExists(root, `${DESIGN_SYSTEM_DIR}/manifest.json`)) {
      throw new Error("A Design System already exists. Use design_system_read, then /design-system:update.")
    }
    throw new Error("design-system/ already contains user files. Move or review them before creating a system there.")
  }

  const preferences = input.preferences ?? []
  const tokens: Record<string, unknown> = { ...input.tokens, schemaVersion: typeof input.tokens.schemaVersion === "string" ? input.tokens.schemaVersion : SCHEMA_VERSION }
  const themes = tokens.themes as Record<string, unknown>
  const tokenPaths = new Set(Object.values(themes).flatMap((theme) => semanticTokenPaths(theme)))
  const components = normalizeComponents(input.components, tokenPaths)
  const patterns = normalizePatterns(input.patterns, tokenPaths)
  const now = new Date().toISOString()
  const records = (items: Array<ComponentDefinition | PatternDefinition>, folder: string) => items.map((item) => ({
    name: item.name,
    file: `${folder}/${slugify(item.name)}.md`,
    tokens: item.tokens ?? [],
  }))
  const manifest: DesignSystemManifest = {
    designSystemVersion: INITIAL_VERSION,
    schemaVersion: SCHEMA_VERSION,
    status: input.status ?? "draft",
    name: input.name.trim(),
    description: input.description.trim(),
    createdAt: now,
    updatedAt: now,
    source: {
      type: input.sourceType ?? "from-scratch",
      ...(input.evidence?.length ? { evidence: input.evidence } : {}),
    },
    themes: Object.keys(themes),
    tokens: "tokens.json",
    preferences: "preferences.json",
    foundations: "FOUNDATIONS.md",
    guidelines: "AI-GUIDELINES.md",
    decisions: "DECISIONS.md",
    changelog: "CHANGELOG.md",
    preview: "preview/index.html",
    screens: "screens/",
    schema: { manifest: "schema/manifest.schema.json", tokens: "schema/tokens.schema.json" },
    components: records(components, "components"),
    patterns: records(patterns, "patterns"),
  }
  const tokensDocument = { ...tokens, $schema: "./schema/tokens.schema.json" }
  const manifestDocument = { $schema: "./schema/manifest.schema.json", ...manifest }
  const preferencesDocument = { schemaVersion: SCHEMA_VERSION, preferences }
  const files = new Map<string, string>([
    ["manifest.json", pretty(manifestDocument)],
    ["tokens.json", pretty(tokensDocument)],
    ["preferences.json", pretty(preferencesDocument)],
    ["FOUNDATIONS.md", `${input.foundations.trim()}\n`],
    ["AI-GUIDELINES.md", aiGuidelines(manifest.name, preferences)],
    ["DECISIONS.md", initialDecisions(preferences)],
    ["CHANGELOG.md", `# Changelog\n\n## ${INITIAL_VERSION} — ${now.slice(0, 10)}\n\n- Initial ${manifest.status} Design System specification.\n`],
    ["schema/manifest.schema.json", pretty(manifestSchema)],
    ["schema/tokens.schema.json", pretty(tokensSchema)],
    ["README.md", systemReadme(manifest)],
    ["tools/generate-preview.mjs", await readFile(new URL("../templates/generate-preview.mjs", import.meta.url), "utf8")],
    ["preview/index.html", createPreviewHtml({ manifest, tokens, components, patterns })],
  ])
  for (const [index, component] of components.entries()) files.set(manifest.components[index]!.file, componentMarkdown(component))
  for (const [index, pattern] of patterns.entries()) files.set(manifest.patterns[index]!.file, patternMarkdown(pattern))

  await mkdir(path.dirname(target), { recursive: true })
  const staging = path.join(path.dirname(target), `.design-system-${randomUUID()}`)
  try {
    for (const [relative, content] of files) {
      const destination = path.join(staging, relative)
      await mkdir(path.dirname(destination), { recursive: true })
      await writeFile(destination, content, "utf8")
    }
    if (existingEntries.length === 0) await rm(target, { recursive: true, force: true })
    await rename(staging, target)
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }

  const conflicts: string[] = []
  await updateManagedBlock(root, "AGENTS.md", "<!-- opencode-design-system:start -->", "<!-- opencode-design-system:end -->", projectAgentsBlock(manifest.name))
  const supportFiles: Array<[string, string]> = [
    [".opencode/skills/design-system/SKILL.md", PORTABLE_SKILL],
    [".opencode/agents/design-system-designer.md", DESIGNER_AGENT],
    [".opencode/agents/screen-designer.md", SCREEN_AGENT],
    [".opencode/commands/design-system.md", `Create or continue the project's Design System. Treat the user as a collaborator: ask only relevant design identity questions, preserve explicit preferences, inspect existing UI read-only when appropriate, then create the framework-neutral files in design-system/. Read AGENTS.md and design-system/AI-GUIDELINES.md. If the OpenCode Design System tools are available, use them to validate and regenerate the preview. Do not edit application UI during analysis. User request: $ARGUMENTS\n`],
    [".opencode/commands/design-system/update.md", `Update the existing Design System in response to: $ARGUMENTS. Read its manifest, preferences, relevant tokens and component/pattern documents first. Explain affected parts and ask only if an identity choice is ambiguous. Keep the user's explicit preferences. Apply semantic updates, record the decision, update the version/changelog, run consistency checks, and regenerate the preview from tokens/specifications. If plugin tools are not available, edit the structured Markdown/JSON deliberately and run node design-system/tools/generate-preview.mjs. Do not use blind search/replace and do not modify application components unless explicitly asked.\n`],
    [".opencode/commands/design-system/preview.md", `Regenerate design-system/preview/index.html from manifest.json, tokens.json, component documents, and patterns. Treat structured Markdown/JSON as the source of truth. If the Design System plugin is available, use its preview tool; otherwise run node design-system/tools/generate-preview.mjs from the project root.\n`],
    [".opencode/commands/design-system/check.md", `Check project UI code against design-system/manifest.json and its semantic tokens. Report unknown values, component/state/layout deviations, and likely inconsistencies with file paths. Do not edit application code. If available, use the Design System check tool.\n`],
    [".opencode/commands/design-screen.md", `Design (do not implement) the requested screen using the Design System. Read AGENTS.md and design-system/AI-GUIDELINES.md, then load only the matching manifest entries, tokens, components, and patterns. Write an implementation-ready brief to design-system/screens/<kebab-case-name>.md with purpose, layout, hierarchy, components/token references, content/data, interactions/states, responsive behavior, and accessibility. If the Design System is absent, say so and write a portable brief without claiming system conformance. Request: $ARGUMENTS\n`],
  ]
  for (const [relative, content] of supportFiles) {
    if (!(await writeIfAbsent(root, relative, content))) conflicts.push(relative)
  }
  return { success: true, manifest, files: [...files.keys()].map((file) => `${DESIGN_SYSTEM_DIR}/${file}`), conflicts }
}

export async function regeneratePreview(root: string): Promise<{ preview: string; componentCount: number; patternCount: number }> {
  const manifest = await readManifest(root)
  const tokens = await readJson<Record<string, unknown>>(root, `${DESIGN_SYSTEM_DIR}/${manifest.tokens}`)
  const components = await Promise.all(manifest.components.map(async (item) => parseComponent(item.name, await readText(root, `${DESIGN_SYSTEM_DIR}/${item.file}`), item.tokens)))
  const patterns = await Promise.all(manifest.patterns.map(async (item) => parsePattern(item.name, await readText(root, `${DESIGN_SYSTEM_DIR}/${item.file}`), item.tokens)))
  const html = createPreviewHtml({ manifest, tokens, components, patterns })
  await atomicWrite(root, `${DESIGN_SYSTEM_DIR}/${manifest.preview}`, html)
  return { preview: `${DESIGN_SYSTEM_DIR}/${manifest.preview}`, componentCount: components.length, patternCount: patterns.length }
}

export async function readManifest(root: string): Promise<DesignSystemManifest> {
  return readJson<DesignSystemManifest>(root, `${DESIGN_SYSTEM_DIR}/manifest.json`)
}

export const readText = readFileText

export async function installPortableSupport(root: string, systemName: string): Promise<string[]> {
  await updateManagedBlock(root, "AGENTS.md", "<!-- opencode-design-system:start -->", "<!-- opencode-design-system:end -->", projectAgentsBlock(systemName))
  return []
}

function validateCreateInput(input: CreateInput): void {
  if (!input.name?.trim()) throw new Error("name is required")
  if (!input.description?.trim()) throw new Error("description is required")
  if (!input.foundations?.trim()) throw new Error("foundations must contain the agreed design foundations")
  const tokenErrors = validateTokens(input.tokens)
  if (tokenErrors.length) throw new Error(tokenErrors.join("; "))
  if (input.preferences && input.preferences.some((item) => !item.key || item.value === undefined)) throw new Error("Each preference requires a key and value")
}

function normalizeComponents(input: ComponentDefinition[] | undefined, availableTokens: Set<string>): ComponentDefinition[] {
  const isDefault = !input?.length
  const items = isDefault ? [
    { name: "Button", purpose: "Triggers a clear, immediate action.", variants: ["primary", "secondary", "danger"], sizes: ["small", "medium", "large"], tokens: ["color.accent.primary", "radius.control", "spacing.control"] },
    { name: "Input", purpose: "Collects a single value with a persistent label and clear validation feedback.", variants: ["default", "error", "success"], sizes: ["medium", "large"], tokens: ["color.surface.base", "color.text.primary", "radius.control"] },
    { name: "Card", purpose: "Groups related content and actions into a distinct surface.", variants: ["default", "interactive"], tokens: ["color.surface.raised", "radius.card", "elevation.surface"] },
  ] : input
  return uniqueNamed(items, "component").map((item) => {
    const tokens = item.tokens ?? []
    const missing = isDefault ? [] : tokens.filter((token) => !availableTokens.has(token))
    if (missing.length) throw new Error(`${item.name} references unknown token(s): ${missing.join(", ")}`)
    return { ...item, tokens: isDefault ? tokens.filter((token) => availableTokens.has(token)) : tokens }
  })
}

function normalizePatterns(input: PatternDefinition[] | undefined, availableTokens: Set<string>): PatternDefinition[] {
  const isDefault = !input?.length
  const items = isDefault ? [{ name: "Form", purpose: "Collect and validate related information with clear progression and recovery.", composition: ["Input", "Button"], tokens: ["spacing.md", "color.status.danger"] }] : input
  return uniqueNamed(items, "pattern").map((item) => {
    const tokens = item.tokens ?? []
    const missing = isDefault ? [] : tokens.filter((token) => !availableTokens.has(token))
    if (missing.length) throw new Error(`${item.name} references unknown token(s): ${missing.join(", ")}`)
    return { ...item, tokens: isDefault ? tokens.filter((token) => availableTokens.has(token)) : tokens }
  })
}

function semanticTokenPaths(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return prefix ? [prefix] : []
  return Object.entries(value).flatMap(([key, item]) => semanticTokenPaths(item, prefix ? `${prefix}.${key}` : key))
}

function uniqueNamed<T extends { name: string }>(items: T[], kind: string): T[] {
  const seen = new Set<string>()
  return items.map((item) => {
    if (!item.name?.trim()) throw new Error(`Every ${kind} requires a name`)
    const key = slugify(item.name)
    if (seen.has(key)) throw new Error(`Duplicate ${kind} name: ${item.name}`)
    seen.add(key)
    return { ...item, name: item.name.trim() }
  })
}

function initialDecisions(preferences: Preference[]): string {
  const lines = preferences.length
    ? preferences.map((item) => `- **${item.key}:** ${JSON.stringify(item.value)}${item.rationale ? ` — ${item.rationale}` : ""}`).join("\n")
    : "- No explicit preferences recorded yet. Add decisions as the system is reviewed."
  return `# Design decisions\n\nThese decisions preserve user intent across future design and implementation work.\n\n## Initial direction\n\n${lines}\n`
}

function systemReadme(manifest: DesignSystemManifest): string {
  return `# ${manifest.name}\n\n${manifest.description}\n\n- **Status:** ${manifest.status}\n- **Design System version:** ${manifest.designSystemVersion}\n- **Schema version:** ${manifest.schemaVersion}\n- **Source:** ${manifest.source.type}\n\n## Source of truth\n\nStart with [manifest.json](manifest.json), which indexes the [semantic tokens](tokens.json), [foundations](FOUNDATIONS.md), [AI guidelines](AI-GUIDELINES.md), [preferences](preferences.json), [decisions](DECISIONS.md), component and pattern documentation, and the generated [interactive preview](preview/index.html).\n\nThe definition is framework-neutral. The HTML is a generated view, not an independent design specification. Update structured files and regenerate the preview.\n\n## Progressive loading\n\nRead the manifest and AI guidelines first. Load only task-relevant component and pattern files and the token branches they reference. Screen design briefs go in [screens/](screens/).\n\n## Plugin-independent maintenance\n\nThis project includes [tools/generate-preview.mjs](tools/generate-preview.mjs), a dependency-free Node.js renderer. After editing structured tokens/specifications without the plugin, run node design-system/tools/generate-preview.mjs from the project root. The project [AGENTS.md](../AGENTS.md) and local OpenCode Skill/agents/commands preserve usage guidance when the plugin is not installed.\n`
}

function pretty(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function parseComponent(name: string, markdown: string, tokens: string[]): ComponentDefinition {
  return {
    name,
    purpose: section(markdown, "Purpose") || `Documented ${name} component.`,
    variants: bullets(section(markdown, "Variants")),
    sizes: bullets(section(markdown, "Sizes")),
    tokens: tokens.length ? tokens : bullets(section(markdown, "Tokens")).map((value) => value.replaceAll("`", "")),
    states: bullets(section(markdown, "States")),
    behavior: section(markdown, "Behavior"),
    accessibility: section(markdown, "Accessibility"),
    responsive: section(markdown, "Responsive"),
    useWhen: section(markdown, "Use when"),
    avoidWhen: section(markdown, "Avoid when"),
    related: bullets(section(markdown, "Related components")),
  }
}

function parsePattern(name: string, markdown: string, tokens: string[]): PatternDefinition {
  return {
    name,
    purpose: section(markdown, "Purpose") || `Documented ${name} pattern.`,
    composition: bullets(section(markdown, "Composition")),
    behavior: section(markdown, "Behavior"),
    responsive: section(markdown, "Responsive"),
    accessibility: section(markdown, "Accessibility"),
    guidance: section(markdown, "Guidance"),
    tokens: tokens.length ? tokens : bullets(section(markdown, "Tokens")).map((value) => value.replaceAll("`", "")),
  }
}

function section(markdown: string, heading: string): string {
  const match = markdown.match(new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, "mi"))
  return match?.[1]?.replace(/^- None specified\.$/m, "").trim() ?? ""
}

function bullets(value: string): string[] {
  return value.split("\n").map((line) => line.match(/^\s*-\s+(.*)$/)?.[1]?.trim()).filter((item): item is string => Boolean(item) && item !== "None specified." && item !== "No direct token references declared.")
}
