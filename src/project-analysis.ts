import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import type { DesignSystemManifest } from "./types.js"
import { readJson } from "./io.js"

const OMIT_DIRS = new Set([
  ".git", ".hg", ".svn", "node_modules", "vendor", "dist", "build", "coverage", ".next", ".nuxt",
  ".svelte-kit", "target", "out", "design-system", ".opencode", ".turbo", ".cache", "storybook-static",
])
const UI_EXTENSIONS = new Set([".css", ".scss", ".sass", ".less", ".html", ".tsx", ".jsx", ".vue", ".svelte", ".astro"])
const STYLE_EXTENSIONS = new Set([".css", ".scss", ".sass", ".less"])
const ASSET_EXTENSIONS = new Set([".svg", ".woff", ".woff2", ".ttf", ".otf"])
const MAX_FILES = 160
const MAX_FILE_BYTES = 48_000
const MAX_TOTAL_BYTES = 750_000

export interface ProjectAnalysis {
  readOnly: true
  scannedFiles: string[]
  truncated: boolean
  frameworks: string[]
  uiLibraries: string[]
  iconPackages: string[]
  assetCandidates: string[]
  responsiveBreakpoints: string[]
  styleSources: Array<{ file: string; variables: Array<{ name: string; value: string }>; colors: string[]; radii: string[]; breakpoints: string[] }>
  colors: Array<{ value: string; occurrences: number; files: string[] }>
  radii: Array<{ value: string; occurrences: number; files: string[] }>
  spacing: Array<{ value: string; occurrences: number }>
  componentCandidates: string[]
  probableInconsistencies: string[]
  notes: string[]
}

export async function analyzeProject(root: string): Promise<ProjectAnalysis> {
  const files: string[] = []
  let truncated = false
  const assetCandidates: string[] = []

  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > 7 || files.length >= MAX_FILES) {
      truncated = true
      return
    }
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && !OMIT_DIRS.has(entry.name)) await walk(absolute, depth + 1)
      } else if (entry.isFile()) {
        const extension = path.extname(entry.name).toLowerCase()
        const relative = path.relative(root, absolute).split(path.sep).join("/")
        if (ASSET_EXTENSIONS.has(extension)) {
          if (assetCandidates.length < 80) assetCandidates.push(relative)
          continue
        }
        if (!UI_EXTENSIONS.has(extension) && !isFrameworkStyleConfig(entry.name)) continue
        files.push(relative)
        if (files.length >= MAX_FILES) {
          truncated = true
          return
        }
      }
    }
  }

  await walk(root, 0)
  let totalBytes = 0
  const contentByFile = new Map<string, string>()
  for (const relative of files) {
    try {
      const content = await readFile(path.join(root, relative), "utf8")
      const bytes = Buffer.byteLength(content)
      if (bytes > MAX_FILE_BYTES || totalBytes + bytes > MAX_TOTAL_BYTES) {
        truncated = true
        continue
      }
      totalBytes += bytes
      contentByFile.set(relative, content)
    } catch {
      // A file may disappear while an analysis is running; skip it without modifying anything.
    }
  }

  const colorStats = new Map<string, Set<string>>()
  const radiusStats = new Map<string, Set<string>>()
  const spacingStats = new Map<string, number>()
  const styleSources: ProjectAnalysis["styleSources"] = []
  const componentCandidates = new Set<string>()
  for (const [file, content] of contentByFile) {
    const ext = path.extname(file).toLowerCase()
    const inStyle = STYLE_EXTENSIONS.has(ext) || isFrameworkStyleConfig(path.basename(file))
    if (inStyle || /\.(?:tsx|jsx|vue|svelte|astro)$/.test(ext)) {
      const variables: Array<{ name: string; value: string }> = []
      for (const match of content.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)\s*;/g)) {
        variables.push({ name: match[1]!, value: compact(match[2]!) })
      }
      const colors = uniqueMatches(content, /#[\da-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\([^)]{1,80}\)/gi)
      const radii = uniqueMatches(content, /(?:border-radius|borderRadius|radius)\s*[:=]\s*["']?([^;'"{}]+)/gi, 1).map(compact)
      const breakpoints = uniqueMatches(content, /@media\s*\([^)]*(?:min-width|max-width)\s*:\s*([^;)]+)/gi, 1).map(compact)
      styleSources.push({ file, variables: variables.slice(0, 50), colors: colors.slice(0, 35), radii: radii.slice(0, 25), breakpoints: breakpoints.slice(0, 20) })
      for (const color of colors) addOccurrence(colorStats, color.toLowerCase(), file)
      for (const radius of radii) addOccurrence(radiusStats, radius.toLowerCase(), file)
      for (const match of content.matchAll(/(?:padding|margin|gap|grid-gap|gridGap|spacing)(?:-[\w]+)?\s*[:=]\s*["']?([^;'"{}]+)/gi)) {
        for (const value of match[1]!.matchAll(/\b\d+(?:\.\d+)?(?:px|rem|em)\b/gi)) {
          spacingStats.set(value[0].toLowerCase(), (spacingStats.get(value[0].toLowerCase()) ?? 0) + 1)
        }
      }
    }
    if (/\.(?:tsx|jsx|vue|svelte|astro)$/i.test(file)) {
      for (const match of content.matchAll(/(?:export\s+)?(?:function|class|const)\s+([A-Z][A-Za-z0-9]{1,50})\b/g)) {
        componentCandidates.add(match[1]!)
      }
    }
  }

  const dependencies = await readDependencies(root)
  const frameworks = dependencies.filter((name) => ["react", "react-dom", "vue", "svelte", "@angular/core", "solid-js", "next", "nuxt", "astro"].includes(name))
  const uiLibraries = dependencies.filter((name) => /(?:mui|material|chakra|radix|shadcn|antd|ant-design|mantine|headlessui|fluent|carbon|prime|vuetify|naive-ui|bootstrap|tailwind)/i.test(name))
  const iconPackages = dependencies.filter((name) => /(?:icon|icons|lucide|heroicons|phosphor|fontawesome|react-icons)/i.test(name))
  const radii = summarize(radiusStats)
  const probableInconsistencies: string[] = []
  const pixelRadii = radii.flatMap((item) => {
    const match = item.value.match(/^([\d.]+)px$/)
    return match ? [{ value: item.value, pixels: Number(match[1]), occurrences: item.occurrences }] : []
  })
  if (pixelRadii.length >= 2) {
    const close = pixelRadii.filter((item) => pixelRadii.some((candidate) => candidate.value !== item.value && Math.abs(candidate.pixels - item.pixels) <= 4))
    if (close.length >= 2) probableInconsistencies.push(`Border radii are close but distinct (${[...new Set(close.map((item) => item.value))].join(", ")}). They may be accidental drift; confirm before normalizing.`)
  }
  if (![...contentByFile.keys()].some((file) => STYLE_EXTENSIONS.has(path.extname(file).toLowerCase()) || isFrameworkStyleConfig(path.basename(file)))) {
    probableInconsistencies.push("No stylesheet or recognized style configuration was found in the bounded scan; visual values may be defined by utility classes, runtime styles, or a dependency.")
  }
  const repeatedColors = summarize(colorStats)
  if (repeatedColors.length > 14) probableInconsistencies.push(`The UI uses ${repeatedColors.length} distinct color literals. Determine which are semantic roles and which are one-off values before proposing consolidation.`)

  const notes = [
    "Read-only analysis: no application files were changed.",
    "Evidence is an inference from source, not proof that each observed variation is intentional.",
    ...(truncated ? [`Scan bounded at ${MAX_FILES} candidate files and/or ${Math.round(MAX_TOTAL_BYTES / 1000)} KB of file contents; results may be incomplete.`] : []),
  ]
  return {
    readOnly: true,
    scannedFiles: [...contentByFile.keys()],
    truncated,
    frameworks,
    uiLibraries,
    iconPackages,
    assetCandidates: assetCandidates.slice(0, 60),
    responsiveBreakpoints: [...new Set(styleSources.flatMap((item) => item.breakpoints))].slice(0, 30),
    styleSources,
    colors: repeatedColors.slice(0, 30),
    radii: radii.slice(0, 24),
    spacing: [...spacingStats].sort((left, right) => right[1] - left[1]).slice(0, 24).map(([value, occurrences]) => ({ value, occurrences })),
    componentCandidates: [...componentCandidates].slice(0, 50),
    probableInconsistencies,
    notes,
  }
}

export async function checkProject(root: string): Promise<{ checkedFiles: number; warnings: string[]; findings: string[] }> {
  const analysis = await analyzeProject(root)
  const warnings: string[] = []
  const findings: string[] = [...analysis.probableInconsistencies]
  let manifest: DesignSystemManifest
  let tokens: Record<string, unknown>
  try {
    manifest = await readJson<DesignSystemManifest>(root, "design-system/manifest.json")
    tokens = await readJson<Record<string, unknown>>(root, `design-system/${manifest.tokens}`)
  } catch {
    return { checkedFiles: analysis.scannedFiles.length, warnings: ["No readable design-system/manifest.json and token file were found."], findings }
  }
  const tokenValues = flattenTokenValues(tokens)
  const knownColors = new Set(tokenValues.filter((item) => item.path.toLowerCase().includes("color")).map((item) => normalizeValue(item.value)))
  const knownRadii = new Set(tokenValues.filter((item) => item.path.toLowerCase().includes("radius")).map((item) => normalizeValue(item.value)))

  for (const style of analysis.styleSources) {
    const content = await readReadOnlyFile(root, style.file)
    if (!content) continue
    for (const color of style.colors) {
      const normalized = normalizeValue(color)
      if (!knownColors.has(normalized)) warnings.push(`${style.file}: color literal ${color} is not an exact token value; verify whether a semantic token should be used.`)
    }
    for (const radius of style.radii) {
      const concrete = radius.match(/^([\d.]+(?:px|rem|em))$/i)?.[1]
      if (concrete && !knownRadii.has(normalizeValue(concrete))) warnings.push(`${style.file}: border-radius ${concrete} is not an exact token value.`)
    }
    if (/(?:button|\.btn)[^{]{0,60}\{[^}]{0,800}(?:min-height|height)\s*:\s*([\d.]+px)/i.test(content)) {
      const height = content.match(/(?:button|\.btn)[^{]{0,60}\{[^}]{0,800}(?:min-height|height)\s*:\s*([\d.]+px)/i)?.[1]
      if (height && !tokenValues.some((item) => /size|height|control/i.test(item.path) && normalizeValue(item.value) === normalizeValue(height))) {
        warnings.push(`${style.file}: button height ${height} has no matching documented size token.`)
      }
    }
  }
  return { checkedFiles: analysis.scannedFiles.length, warnings: unique(warnings).slice(0, 80), findings }
}

function uniqueMatches(content: string, expression: RegExp, group = 0): string[] {
  return [...new Set([...content.matchAll(expression)].map((match) => compact(match[group]!)))]
}

function addOccurrence(stats: Map<string, Set<string>>, value: string, file: string): void {
  const files = stats.get(value) ?? new Set<string>()
  files.add(file)
  stats.set(value, files)
}

function summarize(stats: Map<string, Set<string>>): Array<{ value: string; occurrences: number; files: string[] }> {
  return [...stats].map(([value, files]) => ({ value, occurrences: files.size, files: [...files].slice(0, 8) })).sort((a, b) => b.occurrences - a.occurrences || a.value.localeCompare(b.value))
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 140)
}

async function readDependencies(root: string): Promise<string[]> {
  try {
    const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as Record<string, unknown>
    const dependencies = [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies].filter((value) => value && typeof value === "object") as Array<Record<string, unknown>>
    return [...new Set(dependencies.flatMap((item) => Object.keys(item)))]
  } catch {
    return []
  }
}

async function readReadOnlyFile(root: string, relative: string): Promise<string | undefined> {
  try {
    return await readFile(path.join(root, relative), "utf8")
  } catch {
    return undefined
  }
}

function flattenTokenValues(value: unknown, prefix = ""): Array<{ path: string; value: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return typeof value === "string" || typeof value === "number" ? [{ path: prefix, value: String(value) }] : []
  return Object.entries(value).flatMap(([key, item]) => flattenTokenValues(item, prefix ? `${prefix}.${key}` : key))
}

function normalizeValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function isFrameworkStyleConfig(filename: string): boolean {
  return /^(?:tailwind|postcss|vite|next|nuxt|svelte|astro)\.config\.(?:[cm]?js|[cm]?ts)$/i.test(filename)
}
