import { lstat, mkdir, readFile, readdir, rename, rm, rmdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import type { ComponentDefinition, CreateInput, DesignSystemManifest, PatternDefinition, Preference } from "./types.js"
import { DESIGN_SYSTEM_DIR, resolveInside, slugify } from "./paths.js"
import { aiGuidelines, componentMarkdown, projectAgentsBlock, patternMarkdown } from "./content.js"
import { atomicWrite, fileExists, readJson, readText as readFileText, updateManagedBlock } from "./io.js"
import { manifestSchema, tokensSchema, validateTokens } from "./schema.js"
import { createPreviewHtml } from "./preview.js"
import { renderAuthoredPreview } from "../templates/authored-preview.mjs"

const SCHEMA_VERSION = "1.0.0"
const INITIAL_VERSION = "0.1.0"

export interface CreateResult {
  success: true
  manifest: DesignSystemManifest
  files: string[]
}

export async function createDesignSystem(root: string, input: CreateInput): Promise<CreateResult> {
  validateCreateInput(input)
  const target = resolveInside(root, DESIGN_SYSTEM_DIR)
  let existingDirectories: string[] = []
  let targetExists = false
  try {
    targetExists = true
    const inspection = await inspectExistingDirectoryTree(target)
    if (inspection.userOwnedPaths.length > 0) {
      if (await fileExists(root, `${DESIGN_SYSTEM_DIR}/manifest.json`)) {
        throw new Error("A Design System already exists. Use design_system_read, then /design-system:update.")
      }
      const paths = inspection.userOwnedPaths.map((item) => path.relative(root, item).split(path.sep).join("/"))
      throw new Error(`design-system/ contains existing user-owned files or links: ${paths.join(", ")}. Review them before creating a system there.`)
    }
    existingDirectories = inspection.directories
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      targetExists = false
    } else {
      throw error
    }
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
    ["tools/preview-renderer.mjs", await readFile(new URL("../templates/preview-renderer.mjs", import.meta.url), "utf8")],
    ["tools/authored-preview.mjs", await readFile(new URL("../templates/authored-preview.mjs", import.meta.url), "utf8")],
    ["tools/render-authored-preview.mjs", await readFile(new URL("../templates/render-authored-preview.mjs", import.meta.url), "utf8")],
    ["preview/index.html", input.previewSource ? renderAuthoredPreview(input.previewSource, tokens) : createPreviewHtml({ manifest, tokens, components, patterns })],
  ])
  if (input.previewSource) files.set("preview/source.html", input.previewSource)
  for (const [index, component] of components.entries()) files.set(manifest.components[index]!.file, componentMarkdown(component))
  for (const [index, pattern] of patterns.entries()) files.set(manifest.patterns[index]!.file, patternMarkdown(pattern))

  const generatedFilePaths = new Set(files.keys())
  const directoryConflicts = existingDirectories
    .map((directory) => ({ directory, relative: path.relative(target, directory).split(path.sep).join("/") }))
    .filter(({ relative }) => generatedFilePaths.has(relative))
  if (directoryConflicts.length > 0) {
    const paths = directoryConflicts.map(({ relative }) => `${DESIGN_SYSTEM_DIR}/${relative}`)
    throw new Error(`design-system/ has empty directories where generated files would be written: ${paths.join(", ")}. Review them before creating a system there.`)
  }

  await mkdir(path.dirname(target), { recursive: true })
  const staging = path.join(path.dirname(target), `.design-system-${randomUUID()}`)
  try {
    for (const [relative, content] of files) {
      const destination = path.join(staging, relative)
      await mkdir(path.dirname(destination), { recursive: true })
      await writeFile(destination, content, "utf8")
    }
    if (targetExists) {
      for (const directory of [...existingDirectories].sort((left, right) => right.length - left.length)) {
        await rmdir(directory)
      }
    }
    await rename(staging, target)
    if (targetExists) await restoreEmptyDirectories(existingDirectories)
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined)
    if (existingDirectories.length > 0) await restoreEmptyDirectories(existingDirectories)
    const code = (error as NodeJS.ErrnoException).code
    if (targetExists && (code === "ENOTEMPTY" || code === "EEXIST" || code === "EPERM")) {
      throw new Error("design-system/ changed during creation or contains user-owned content. Existing files were preserved; review the folder and retry.")
    }
    throw error
  }

  await updateManagedBlock(root, "AGENTS.md", "<!-- opencode-design-system:start -->", "<!-- opencode-design-system:end -->", projectAgentsBlock(manifest.name))
  return { success: true, manifest, files: [...files.keys()].map((file) => `${DESIGN_SYSTEM_DIR}/${file}`) }
}

export async function regeneratePreview(root: string): Promise<{ preview: string; componentCount: number; patternCount: number; mode: "authored" | "provisional" }> {
  const manifest = await readManifest(root)
  const tokens = await readJson<Record<string, unknown>>(root, `${DESIGN_SYSTEM_DIR}/${manifest.tokens}`)
  const sourcePath = `${DESIGN_SYSTEM_DIR}/preview/source.html`
  if (await fileExists(root, sourcePath)) {
    const source = await readText(root, sourcePath)
    const html = renderAuthoredPreview(source, tokens)
    await atomicWrite(root, `${DESIGN_SYSTEM_DIR}/${manifest.preview}`, html)
    return { preview: `${DESIGN_SYSTEM_DIR}/${manifest.preview}`, componentCount: manifest.components.length, patternCount: manifest.patterns.length, mode: "authored" }
  }
  const components = await Promise.all(manifest.components.map(async (item) => parseComponent(item.name, await readText(root, `${DESIGN_SYSTEM_DIR}/${item.file}`), item.tokens)))
  const patterns = await Promise.all(manifest.patterns.map(async (item) => parsePattern(item.name, await readText(root, `${DESIGN_SYSTEM_DIR}/${item.file}`), item.tokens)))
  const html = createPreviewHtml({ manifest, tokens, components, patterns })
  await atomicWrite(root, `${DESIGN_SYSTEM_DIR}/${manifest.preview}`, html)
  return { preview: `${DESIGN_SYSTEM_DIR}/${manifest.preview}`, componentCount: components.length, patternCount: patterns.length, mode: "provisional" }
}

export async function authorPreview(root: string, source: string): Promise<Awaited<ReturnType<typeof regeneratePreview>>> {
  const manifest = await readManifest(root)
  const tokens = await readJson<Record<string, unknown>>(root, `${DESIGN_SYSTEM_DIR}/${manifest.tokens}`)
  const compiled = renderAuthoredPreview(source, tokens)
  const sourcePath = `${DESIGN_SYSTEM_DIR}/preview/source.html`
  // Never silently replace a project's own preview source. Agent revisions to an
  // existing source belong in an explicit file edit, followed by regeneration.
  if (await fileExists(root, sourcePath)) throw new Error(`${sourcePath} already exists. Read and edit it deliberately, then call design_system_preview without source.`)
  for (const file of ["authored-preview.mjs", "render-authored-preview.mjs"]) {
    const destination = `${DESIGN_SYSTEM_DIR}/tools/${file}`
    if (!await fileExists(root, destination)) {
      await writeFile(resolveInside(root, destination), await readFile(new URL(`../templates/${file}`, import.meta.url), "utf8"), { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error
      })
    }
  }
  await writeFile(resolveInside(root, sourcePath), source, { flag: "wx" })
  await atomicWrite(root, `${DESIGN_SYSTEM_DIR}/${manifest.preview}`, compiled)
  return { preview: `${DESIGN_SYSTEM_DIR}/${manifest.preview}`, componentCount: manifest.components.length, patternCount: manifest.patterns.length, mode: "authored" }
}

export async function readManifest(root: string): Promise<DesignSystemManifest> {
  return readJson<DesignSystemManifest>(root, `${DESIGN_SYSTEM_DIR}/manifest.json`)
}

export const readText = readFileText

async function inspectExistingDirectoryTree(target: string): Promise<{ directories: string[]; userOwnedPaths: string[] }> {
  const directories: string[] = []
  const userOwnedPaths: string[] = []

  async function visit(directory: string): Promise<void> {
    const info = await lstat(directory)
    if (info.isSymbolicLink() || !info.isDirectory()) {
      userOwnedPaths.push(directory)
      return
    }
    directories.push(directory)
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name)
      if (entry.isDirectory() && !entry.isSymbolicLink()) await visit(child)
      else userOwnedPaths.push(child)
    }
  }

  await visit(target)
  return { directories, userOwnedPaths }
}

async function restoreEmptyDirectories(directories: string[]): Promise<void> {
  for (const directory of [...directories].sort((left, right) => left.length - right.length)) {
    await mkdir(directory, { recursive: true }).catch(() => undefined)
  }
}

function validateCreateInput(input: CreateInput): void {
  if (!input.name?.trim()) throw new Error("name is required")
  if (!input.description?.trim()) throw new Error("description is required")
  if (!input.foundations?.trim()) throw new Error("foundations must contain the agreed design foundations")
  if (input.previewSource !== undefined && !input.previewSource.trim()) throw new Error("previewSource must contain a complete authored HTML document")
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
  return `# ${manifest.name}\n\n${manifest.description}\n\n- **Status:** ${manifest.status}\n- **Design System version:** ${manifest.designSystemVersion}\n- **Schema version:** ${manifest.schemaVersion}\n- **Source:** ${manifest.source.type}\n\n## Source of truth\n\nStart with [manifest.json](manifest.json), which indexes the [semantic tokens](tokens.json), [foundations](FOUNDATIONS.md), [AI guidelines](AI-GUIDELINES.md), [preferences](preferences.json), [decisions](DECISIONS.md), component and pattern documentation, and the generated [interactive preview](preview/index.html).\n\nThe definition is framework-neutral. The HTML is a generated view, not an independent design specification. Update structured files and regenerate the preview. An agent can create a project-specific [preview/source.html](preview/source.html); its CSS uses \`var(--ds-color-accent)\` and other semantic token variables, with \`<!-- opencode-design-system:theme-tokens -->\` inside <head>. It is a showcase, not the design specification. The HTML output is regenerated without replacing its source.\n\n## Progressive loading\n\nRead the manifest and AI guidelines first. Load only task-relevant component and pattern files and the token branches they reference. Screen design briefs go in [screens/](screens/).\n\n## Plugin-independent maintenance\n\nRun node design-system/tools/generate-preview.mjs from the project root to regenerate the preview from structured tokens and, if present, the authored source. For older installations with an existing generator, use node design-system/tools/render-authored-preview.mjs after adding preview/source.html. The project's [AGENTS.md](../AGENTS.md) block points any coding agent to the portable system.\n`
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
  const match = markdown.match(new RegExp(`^## ${heading}[ \\t]*\\r?\\n([\\s\\S]*?)(?=\\r?\\n## |(?![\\s\\S]))`, "mi"))
  return match?.[1]?.replace(/^- None specified\.$/m, "").trim() ?? ""
}

function bullets(value: string): string[] {
  return value.split("\n").map((line) => line.match(/^\s*-\s+(.*)$/)?.[1]?.trim()).filter((item): item is string => Boolean(item) && item !== "None specified." && item !== "No direct token references declared.")
}
