import { atomicWrite, fileExists, readJson, readText } from "./io.js"
import { DESIGN_SYSTEM_DIR } from "./paths.js"
import { readManifest, regeneratePreview } from "./generator.js"
import { aiGuidelines, componentMarkdown, patternMarkdown } from "./content.js"
import { validateTokens } from "./schema.js"
import { slugify } from "./paths.js"
import type { ComponentDefinition, DesignSystemManifest, PatternDefinition, Preference, UpdateInput } from "./types.js"

export interface UpdateResult {
  success: true
  previousVersion: string
  version: string
  status: DesignSystemManifest["status"]
  updatedTokens: string[]
  addedTokens: string[]
  addedComponents: string[]
  addedPatterns: string[]
  impact: UpdateInput["impact"]
  affectedComponents: string[]
  affectedPatterns: string[]
  updatedDocuments: string[]
  consistencyWarnings: string[]
  regenerated: string[]
}

export async function updateDesignSystem(root: string, input: UpdateInput): Promise<UpdateResult> {
  if (!input.request.trim()) throw new Error("request is required")
  if (!input.decision.trim()) throw new Error("decision is required to preserve the rationale")
  if (!input.tokenUpdates.length && !input.tokenAdds?.length && !input.componentUpdates?.length && !input.patternUpdates?.length && !input.newComponents?.length && !input.newPatterns?.length && !input.foundationUpdate && !input.preferenceUpdates?.length && !input.status) {
    throw new Error("The update has no token, foundation, or preference change to apply")
  }
  const manifest = await readManifest(root)
  const previousVersion = manifest.designSystemVersion
  const tokens = await readJson<Record<string, unknown>>(root, `${DESIGN_SYSTEM_DIR}/${manifest.tokens}`)
  const preferencesDocument = await readJson<{ schemaVersion?: string; preferences?: Preference[] }>(root, `${DESIGN_SYSTEM_DIR}/${manifest.preferences}`)
  const preferences = mergePreferences(preferencesDocument.preferences ?? [], input.preferenceUpdates ?? [])
  const updatedTokens: string[] = []
  const addedTokens: string[] = []
  for (const token of input.tokenUpdates) {
    const parts = parseTokenPath(token.path)
    setSemanticToken(tokens, parts, token.value)
    updatedTokens.push(parts.join("."))
  }
  for (const token of input.tokenAdds ?? []) {
    const parts = parseTokenPath(token.path)
    if (parts[0] === "themes") throw new Error("New semantic tokens must be added to every theme; use an unprefixed semantic path")
    addSemanticToken(tokens, parts, token.values)
    updatedTokens.push(parts.join("."))
    addedTokens.push(parts.join("."))
  }
  const tokenErrors = validateTokens(tokens)
  if (tokenErrors.length) throw new Error(tokenErrors.join("; "))
  const componentAdditions = await prepareComponentAdditions(root, manifest, tokens, input.newComponents ?? [])
  const patternAdditions = await preparePatternAdditions(root, manifest, tokens, input.newPatterns ?? [])
  manifest.components.push(...componentAdditions.map((item) => ({ name: item.name, file: item.file, tokens: item.definition.tokens ?? [] })))
  manifest.patterns.push(...patternAdditions.map((item) => ({ name: item.name, file: item.file, tokens: item.definition.tokens ?? [] })))
  const documentUpdates = await validateDocumentUpdates(manifest, input)
  const updatedNames = new Set(documentUpdates.map((item) => `${item.kind}:${item.name.toLowerCase()}`))
  for (const item of componentAdditions) if (updatedNames.has(`component:${item.name.toLowerCase()}`)) throw new Error(`Use either newComponents or componentUpdates for ${item.name}, not both`)
  for (const item of patternAdditions) if (updatedNames.has(`pattern:${item.name.toLowerCase()}`)) throw new Error(`Use either newPatterns or patternUpdates for ${item.name}, not both`)
  const addedDocuments = [
    ...componentAdditions.map((item) => ({ kind: "component" as const, name: item.name, file: item.file, content: componentMarkdown(item.definition) })),
    ...patternAdditions.map((item) => ({ kind: "pattern" as const, name: item.name, file: item.file, content: patternMarkdown(item.definition) })),
  ]
  const updatedDocuments = [...documentUpdates, ...addedDocuments]
  for (const document of updatedDocuments) {
    if (document.kind === "component") {
      const entry = manifest.components.find((item) => item.name === document.name)!
      const updatedTokenReferences = extractTokenReferences(document.content)
      if (updatedTokenReferences.length) entry.tokens = updatedTokenReferences
    } else {
      const entry = manifest.patterns.find((item) => item.name === document.name)!
      const updatedTokenReferences = extractTokenReferences(document.content)
      if (updatedTokenReferences.length) entry.tokens = updatedTokenReferences
    }
  }
  const dependency = await findTokenDependents(root, manifest, updatedTokens.map((item) => item.replace(/^themes\.[^.]+\./, "")), updatedDocuments)
  const warnings = await tokenReferenceWarnings(root, manifest, tokens, updatedDocuments)

  const now = new Date()
  const impact = componentAdditions.length || patternAdditions.length || addedTokens.length
    ? input.impact === "major" ? "major" : "minor"
    : input.impact
  const version = bumpVersion(previousVersion, impact)
  const date = now.toISOString().slice(0, 10)
  manifest.designSystemVersion = version
  manifest.updatedAt = now.toISOString()
  manifest.status = input.status ?? "draft"
  manifest.themes = Object.keys(tokens.themes as Record<string, unknown>)
  const changelogEntry = `## ${version} — ${date} (${impact.toUpperCase()})\n\n- ${input.request.trim()}\n- Decision: ${input.decision.trim()}\n- Updated tokens: ${updatedTokens.length ? updatedTokens.map((item) => `\`${item}\``).join(", ") : "none"}.\n- Added components: ${componentAdditions.map((item) => item.name).join(", ") || "none"}.\n- Added patterns: ${patternAdditions.map((item) => item.name).join(", ") || "none"}.\n- Affected components: ${dependency.components.length ? dependency.components.join(", ") : "none detected"}.\n- Affected patterns: ${dependency.patterns.length ? dependency.patterns.join(", ") : "none detected"}.\n`
  const [changelog, decisions, foundations] = await Promise.all([
    readText(root, `${DESIGN_SYSTEM_DIR}/${manifest.changelog}`),
    readText(root, `${DESIGN_SYSTEM_DIR}/${manifest.decisions}`),
    readText(root, `${DESIGN_SYSTEM_DIR}/${manifest.foundations}`),
  ])
  const decisionEntry = `\n## ${date} — ${input.request.trim()}\n\n${input.decision.trim()}\n\n- Version: ${version} (${impact.toUpperCase()})\n${updatedTokens.map((item) => `- Token: \`${item}\``).join("\n")}\n`

  await atomicWrite(root, `${DESIGN_SYSTEM_DIR}/${manifest.tokens}`, `${JSON.stringify({ ...tokens, $schema: "./schema/tokens.schema.json" }, null, 2)}\n`)
  await atomicWrite(root, `${DESIGN_SYSTEM_DIR}/${manifest.preferences}`, `${JSON.stringify({ schemaVersion: preferencesDocument.schemaVersion ?? manifest.schemaVersion, preferences }, null, 2)}\n`)
  for (const document of updatedDocuments) {
    const entry = document.kind === "component" ? manifest.components.find((item) => item.name === document.name)! : manifest.patterns.find((item) => item.name === document.name)!
    await atomicWrite(root, `${DESIGN_SYSTEM_DIR}/${entry.file}`, document.content.endsWith("\n") ? document.content : `${document.content}\n`)
  }
  if (input.foundationUpdate?.trim()) {
    await atomicWrite(root, `${DESIGN_SYSTEM_DIR}/${manifest.foundations}`, `${foundations.trimEnd()}\n\n## Iteration — ${date}\n\n${input.foundationUpdate.trim()}\n`)
  }
  await atomicWrite(root, `${DESIGN_SYSTEM_DIR}/${manifest.decisions}`, `${decisions.trimEnd()}\n${decisionEntry}`)
  await atomicWrite(root, `${DESIGN_SYSTEM_DIR}/${manifest.changelog}`, `# Changelog\n\n${changelogEntry}\n${changelog.replace(/^# Changelog\s*/i, "").trim()}\n`)
  await atomicWrite(root, `${DESIGN_SYSTEM_DIR}/${manifest.guidelines}`, aiGuidelines(manifest.name, preferences))
  await atomicWrite(root, `${DESIGN_SYSTEM_DIR}/manifest.json`, `${JSON.stringify({ $schema: "./schema/manifest.schema.json", ...manifest }, null, 2)}\n`)
  const readme = await readText(root, `${DESIGN_SYSTEM_DIR}/README.md`)
  const updatedReadme = readme
    .replace(/^- \*\*Status:\*\* .*$/m, `- **Status:** ${manifest.status}`)
    .replace(/^- \*\*Design System version:\*\* .*$/m, `- **Design System version:** ${version}`)
  await atomicWrite(root, `${DESIGN_SYSTEM_DIR}/README.md`, updatedReadme)
  const preview = await regeneratePreview(root)
  return {
    success: true,
    previousVersion,
    version,
    status: manifest.status,
    impact,
    updatedTokens,
    addedTokens,
    addedComponents: componentAdditions.map((item) => item.name),
    addedPatterns: patternAdditions.map((item) => item.name),
    affectedComponents: dependency.components,
    affectedPatterns: dependency.patterns,
    updatedDocuments: updatedDocuments.map((item) => `${DESIGN_SYSTEM_DIR}/${item.file}`),
    consistencyWarnings: warnings,
    regenerated: [`${DESIGN_SYSTEM_DIR}/${manifest.tokens}`, `${DESIGN_SYSTEM_DIR}/${manifest.preferences}`, `${DESIGN_SYSTEM_DIR}/${manifest.guidelines}`, `${DESIGN_SYSTEM_DIR}/${manifest.decisions}`, `${DESIGN_SYSTEM_DIR}/${manifest.changelog}`, `${DESIGN_SYSTEM_DIR}/${manifest.preview}`, ...(input.foundationUpdate?.trim() ? [`${DESIGN_SYSTEM_DIR}/${manifest.foundations}`] : [])],
  }
}

async function validateDocumentUpdates(manifest: DesignSystemManifest, input: UpdateInput): Promise<Array<{ kind: "component" | "pattern"; name: string; file: string; content: string }>> {
  const updates: Array<{ kind: "component" | "pattern"; name: string; file: string; content: string }> = []
  for (const [kind, documents, records] of [
    ["component", input.componentUpdates ?? [], manifest.components],
    ["pattern", input.patternUpdates ?? [], manifest.patterns],
  ] as const) {
    const seen = new Set<string>()
    for (const document of documents) {
      if (!document.name?.trim() || !document.content?.trim()) throw new Error(`Each ${kind} update requires a name and Markdown content`)
      if (document.content.length > 40_000) throw new Error(`${kind} document ${document.name} exceeds 40 KB`)
      const record = records.find((item) => item.name.toLowerCase() === document.name.toLowerCase())
      if (!record) throw new Error(`Unknown ${kind} document: ${document.name}`)
      if (seen.has(record.name)) throw new Error(`Duplicate ${kind} update: ${record.name}`)
      seen.add(record.name)
      updates.push({ kind, name: record.name, file: record.file, content: document.content.trim() })
    }
  }
  return updates
}

async function prepareComponentAdditions(
  root: string,
  manifest: DesignSystemManifest,
  tokens: Record<string, unknown>,
  definitions: ComponentDefinition[],
): Promise<Array<{ name: string; file: string; definition: ComponentDefinition }>> {
  return prepareAdditions(root, manifest.components, "components", tokens, definitions)
}

async function preparePatternAdditions(
  root: string,
  manifest: DesignSystemManifest,
  tokens: Record<string, unknown>,
  definitions: PatternDefinition[],
): Promise<Array<{ name: string; file: string; definition: PatternDefinition }>> {
  return prepareAdditions(root, manifest.patterns, "patterns", tokens, definitions)
}

async function prepareAdditions<T extends { name: string; purpose: string; tokens?: string[] }>(
  root: string,
  existing: Array<{ name: string; file: string; tokens: string[] }>,
  folder: "components" | "patterns",
  tokenDocument: Record<string, unknown>,
  definitions: T[],
): Promise<Array<{ name: string; file: string; definition: T }>> {
  const themes = tokenDocument.themes as Record<string, unknown> | undefined
  const knownTokens = new Set(Object.values(themes ?? {}).flatMap((theme) => flattenPaths(theme)))
  const names = new Set(existing.map((item) => slugify(item.name)))
  const additions: Array<{ name: string; file: string; definition: T }> = []
  for (const source of definitions) {
    const name = source.name?.trim()
    if (!name || !source.purpose?.trim()) throw new Error(`Each new ${folder.slice(0, -1)} requires a name and purpose`)
    const slug = slugify(name)
    if (names.has(slug)) throw new Error(`A ${folder.slice(0, -1)} with this name already exists: ${name}`)
    names.add(slug)
    const missing = (source.tokens ?? []).filter((token) => !knownTokens.has(token))
    if (missing.length) throw new Error(`${name} references unknown token(s): ${missing.join(", ")}`)
    const file = `${folder}/${slug}.md`
    if (await fileExists(root, `${DESIGN_SYSTEM_DIR}/${file}`)) throw new Error(`Refusing to overwrite an existing file while adding ${name}: ${file}`)
    additions.push({ name, file, definition: { ...source, name } })
  }
  return additions
}

function extractTokenReferences(markdown: string): string[] {
  const section = markdown.match(/^## Tokens\s*\n([\s\S]*?)(?=\n## |$)/mi)?.[1]
  if (!section) return []
  return [...section.matchAll(/^\s*-\s+`([a-zA-Z][\w-]*(?:\.[a-zA-Z][\w-]*)+)`\s*$/gm)].map((item) => item[1]!)
}

export async function findTokenDependents(
  root: string,
  manifest: DesignSystemManifest,
  paths: string[],
  documentOverrides: Array<{ file: string; content: string }> = [],
): Promise<{ components: string[]; patterns: string[] }> {
  const check = async (entries: DesignSystemManifest["components"]) => {
    const result: string[] = []
    for (const entry of entries) {
      const content = documentOverrides.find((item) => item.file === entry.file)?.content ?? await readText(root, `${DESIGN_SYSTEM_DIR}/${entry.file}`)
      const declared = new Set([...entry.tokens, ...pathsFromMarkdown(content)])
      if (paths.some((token) => declared.has(token))) result.push(entry.name)
    }
    return result
  }
  return { components: await check(manifest.components), patterns: await check(manifest.patterns) }
}

function parseTokenPath(value: string): string[] {
  const parts = value.split(".")
  if (parts.length < 2 || parts.some((part) => !/^[a-zA-Z][\w-]*$/.test(part) || ["__proto__", "prototype", "constructor"].includes(part))) {
    throw new Error(`Invalid semantic token path: ${value}`)
  }
  return parts
}

function setSemanticToken(root: Record<string, unknown>, parts: string[], value: string | number | boolean): void {
  if (parts[0] === "themes") {
    setExistingPath(root, parts, value)
    return
  }
  const themes = root.themes
  if (!themes || typeof themes !== "object" || Array.isArray(themes)) throw new Error("tokens.themes is missing")
  const updated: string[] = []
  for (const [themeName, theme] of Object.entries(themes as Record<string, unknown>)) {
    if (!theme || typeof theme !== "object" || Array.isArray(theme)) continue
    try {
      setExistingPath(theme as Record<string, unknown>, parts, value)
      updated.push(themeName)
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("Token path does not exist:")) throw error
    }
  }
  if (!updated.length) throw new Error(`Token path does not exist in any theme: ${parts.join(".")}`)
}

function setExistingPath(root: Record<string, unknown>, parts: string[], value: string | number | boolean): void {
  let current: Record<string, unknown> = root
  for (const part of parts.slice(0, -1)) {
    const next = current[part]
    if (!next || typeof next !== "object" || Array.isArray(next)) throw new Error(`Token path does not exist: ${parts.join(".")}`)
    current = next as Record<string, unknown>
  }
  const key = parts.at(-1)!
  if (!(key in current)) throw new Error(`Token path does not exist: ${parts.join(".")}; add new tokens through a reviewed system expansion`)
  current[key] = value
}

function addSemanticToken(document: Record<string, unknown>, parts: string[], values: Record<string, string | number | boolean>): void {
  const themes = document.themes
  if (!themes || typeof themes !== "object" || Array.isArray(themes)) throw new Error("tokens.themes is missing")
  const themeNames = Object.keys(themes as object)
  const suppliedThemes = Object.keys(values ?? {})
  const missingThemes = themeNames.filter((name) => !Object.hasOwn(values ?? {}, name))
  const unknownThemes = suppliedThemes.filter((name) => !themeNames.includes(name))
  if (missingThemes.length || unknownThemes.length) throw new Error(`New token ${parts.join(".")} requires one value for each theme. Missing: ${missingThemes.join(", ") || "none"}; unknown: ${unknownThemes.join(", ") || "none"}.`)
  for (const themeName of themeNames) {
    const theme = (themes as Record<string, unknown>)[themeName]
    const value = values[themeName]
    if (!theme || typeof theme !== "object" || Array.isArray(theme)) throw new Error(`tokens.themes.${themeName} must be an object`)
    if (!["string", "number", "boolean"].includes(typeof value)) throw new Error(`Token value for theme ${themeName} must be a string, number, or boolean`)
    setNewPath(theme as Record<string, unknown>, parts, value)
  }
}

function setNewPath(root: Record<string, unknown>, parts: string[], value: string | number | boolean): void {
  let current = root
  for (const part of parts.slice(0, -1)) {
    const existing = current[part]
    if (existing === undefined) current[part] = {}
    else if (!existing || typeof existing !== "object" || Array.isArray(existing)) throw new Error(`Token path conflicts with an existing value: ${parts.join(".")}`)
    current = current[part] as Record<string, unknown>
  }
  const leaf = parts.at(-1)!
  if (Object.hasOwn(current, leaf)) throw new Error(`Token path already exists: ${parts.join(".")}`)
  current[leaf] = value
}

function mergePreferences(current: Preference[], updates: Preference[]): Preference[] {
  const result = new Map(current.map((item) => [item.key, item]))
  for (const item of updates) {
    if (!item.key || item.value === undefined) throw new Error("Each preference update requires a key and value")
    result.set(item.key, { ...result.get(item.key), ...item })
  }
  return [...result.values()]
}

function pathsFromMarkdown(content: string): string[] {
  return [...content.matchAll(/`([a-zA-Z][\w-]*(?:\.[a-zA-Z][\w-]*)+)`/g)].map((item) => item[1]!)
}

async function tokenReferenceWarnings(
  root: string,
  manifest: DesignSystemManifest,
  tokens: Record<string, unknown>,
  documentOverrides: Array<{ file: string; content: string }> = [],
): Promise<string[]> {
  const themes = tokens.themes as Record<string, unknown> | undefined
  const known = new Set(Object.values(themes ?? {}).flatMap((theme) => flattenPaths(theme)))
  const missing = new Set<string>()
  for (const entry of [...manifest.components, ...manifest.patterns]) {
    const content = documentOverrides.find((item) => item.file === entry.file)?.content ?? await readText(root, `${DESIGN_SYSTEM_DIR}/${entry.file}`)
    for (const token of [...entry.tokens, ...pathsFromMarkdown(content)]) if (!known.has(token)) missing.add(`${entry.name}: ${token}`)
  }
  return [...missing].map((item) => `Unresolved token reference ${item}`)
}

function flattenPaths(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return prefix ? [prefix] : []
  return Object.entries(value).flatMap(([key, item]) => flattenPaths(item, prefix ? `${prefix}.${key}` : key))
}

function bumpVersion(version: string, impact: UpdateInput["impact"]): string {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) throw new Error(`Invalid designSystemVersion: ${version}`)
  let major = Number(match[1])
  let minor = Number(match[2])
  let patch = Number(match[3])
  if (impact === "major") { major += 1; minor = 0; patch = 0 }
  else if (impact === "minor") { minor += 1; patch = 0 }
  else patch += 1
  return `${major}.${minor}.${patch}`
}
