import { existsSync } from "node:fs"
import path from "node:path"
import { Plugin } from "@opencode/plugin"
import { createDesignSystem, readManifest, regeneratePreview } from "./generator.js"
import { readJson, readText, fileExists } from "./io.js"
import { DESIGN_SYSTEM_DIR } from "./paths.js"
import { analyzeProject, checkProject } from "./project-analysis.js"
import { saveScreenSpec } from "./screen.js"
import { updateDesignSystem } from "./update.js"
import type { CreateInput, DesignSystemManifest, Preference, UpdateInput } from "./types.js"

const commandPrompts: Array<{ name: string; description: string; instruction: string }> = [
  {
    name: "design-system",
    description: "Create a Design System collaboratively, from scratch or from an existing UI",
    instruction: `Act as a collaborative design-system designer. Gather only identity decisions that are genuinely unclear; honor explicit preferences. If a Design System already exists, read it and offer an update/continue path rather than overwriting it. If the repository has UI and the user has not said whether to formalize that UI or start fresh, call the read-only analysis tool and ask which path they prefer; do not assume. Distinguish evidence from inference and ask about important inconsistencies before normalization. For a new system, confirm a concise visual direction before writing files; then call design_system_create with neutral tokens, foundations, explicit preferences, a few useful components and patterns, and source evidence. Keep status draft until reviewed. Do not modify application files.\n\nUser request:`,
  },
  {
    name: "design-system/update",
    description: "Make a coherent, versioned change to the existing Design System",
    instruction: `Work collaboratively as a design-system architect. Read the Design System first using design_system_read. Interpret the request semantically, identify impacted token paths and dependent components/patterns, and honor recorded decisions. If the request conflicts with an explicit preference, ask before changing it. For a clear requested change, apply it with design_system_update, explain the dependency impact, provide revised full componentUpdates/patternUpdates where documented behavior or guidance needs a semantic change, add tokens only when existing semantic paths do not fit and then provide a value for every theme, add reusable components/patterns when composition is insufficient, update preferences/decisions/foundations where appropriate, choose patch/minor/major impact (expansion requires at least minor), and report unresolved references. Do not use blind text replacement and do not modify app UI code.\n\nUser request:`,
  },
  {
    name: "design-system/preview",
    description: "Generate or refresh the interactive Design System preview",
    instruction: `Call design_system_preview to regenerate the interactive preview from the structured manifest, tokens, foundations, components, and patterns. Summarize the output file and whether light/dark themes and interactive examples are present. Do not treat the HTML as source of truth.\n\nUser request:`,
  },
  {
    name: "design-system/check",
    description: "Check UI styles for values that drift from the Design System",
    instruction: `Call design_system_check. Report findings with file paths and explain which are exact deviations versus heuristic candidates. The check is read-only and bounded; do not automatically fix application files. Suggest a semantic token or component where possible.\n\nUser request:`,
  },
  {
    name: "design-screen",
    description: "Design a screen specification using relevant Design System documentation",
    instruction: `Act as a UI/UX screen designer. First call design_system_read with the user's task to load only the relevant tokens, components, patterns, preferences, and guidelines. Clarify the screen's purpose and key content when needed, then define hierarchy, layout, data, states, interactions, responsive behavior, and accessibility. Keep design separate from implementation. Call design_system_screen_spec to save an implementation-ready Markdown specification under design-system/screens/. Do not write UI code unless asked separately.\n\nUser request:`,
  },
]

export default Plugin.define({
  id: "opencode-design-system",
  async setup(ctx) {
    const projectRoot = path.resolve(ctx.location.project.canonical || ctx.location.directory)
    const designSystemPath = path.join(projectRoot, DESIGN_SYSTEM_DIR, "manifest.json")
    await ctx.session.hook("context", (event) => {
      if (!existsSync(designSystemPath)) return
      event.system.push({
        type: "text",
        text: "This project has a framework-neutral Design System at design-system/manifest.json. Follow the Design System guidance in AGENTS.md and design-system/AI-GUIDELINES.md; read only the relevant tokens, components, and patterns, and treat the HTML preview as generated output rather than the source of truth.",
      })
    })

    await ctx.command.transform((editor) => {
      for (const command of commandPrompts) {
        editor.add({
          name: command.name,
          description: command.description,
          execute: async ({ sessionID, prompt, delivery }) => {
            const suffix = prompt.text?.trim() ? `\n\n${prompt.text.trim()}` : ""
            await ctx.session.prompt({
              ...prompt,
              sessionID,
              text: `${command.instruction}${suffix}`,
              delivery,
            })
          },
        })
      }
    })

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "design_system",
        description: "Create, inspect, update, validate, preview, and write screen specifications for the portable project Design System.",
      })
      editor.add({
        name: "create",
        description: "Create the project's framework-neutral Design System after the user has agreed on a design direction. Refuses to overwrite an existing design-system/ folder.",
        options: { namespace: "design_system", codemode: true },
        input: {
          type: "object",
          properties: {
            name: { type: "string", description: "Short Design System name." },
            description: { type: "string", description: "Product context and concise visual direction." },
            tokens: { type: "object", description: "Framework-neutral semantic tokens. Include schemaVersion and themes, with semantic groups such as color, typography, spacing, radius, elevation, motion, and breakpoints." },
            foundations: { type: "string", description: "Human-readable design philosophy and foundation rules in Markdown." },
            preferences: { type: "array", items: preferenceSchema },
            components: { type: "array", items: componentSchema },
            patterns: { type: "array", items: patternSchema },
            sourceType: { type: "string", enum: ["from-scratch", "existing-project"] },
            evidence: { type: "array", items: { type: "string" } },
            status: { type: "string", enum: ["draft", "review", "stable"] },
          },
          required: ["name", "description", "tokens", "foundations"],
          additionalProperties: false,
        },
        execute: async (raw) => {
          const result = await createDesignSystem(projectRoot, raw as unknown as CreateInput)
          return { content: JSON.stringify(result, null, 2) }
        },
      })
      editor.add({
        name: "read",
        description: "Read the manifest and only those Design System tokens, foundation sections, components, and patterns relevant to a UI task. This is the preferred progressive-loading entry point.",
        options: { namespace: "design_system", codemode: true },
        input: {
          type: "object",
          properties: { task: { type: "string", description: "The screen, component, or UI change being designed/implemented." } },
          required: ["task"],
          additionalProperties: false,
        },
        execute: async (raw) => ({ content: JSON.stringify(await readRelevantSystem(projectRoot, String((raw as { task: string }).task)), null, 2) }),
      })
      editor.add({
        name: "analyze",
        description: "Read-only bounded analysis of an existing app's UI/style sources, frameworks, tokens, component candidates, and likely inconsistencies. It never edits app files.",
        options: { namespace: "design_system", codemode: true },
        input: { type: "object", properties: {}, additionalProperties: false },
        execute: async () => ({ content: JSON.stringify(summarizeAnalysis(await analyzeProject(projectRoot)), null, 2) }),
      })
      editor.add({
        name: "update",
        description: "Apply a semantic, versioned Design System update; changes existing token paths, records the user decision, refreshes guidelines and preview, and reports dependent components/patterns.",
        options: { namespace: "design_system", codemode: true },
        input: {
          type: "object",
          properties: {
            request: { type: "string" },
            tokenUpdates: { type: "array", items: { type: "object", properties: { path: { type: "string", description: "Existing semantic token path such as color.accent.primary. Prefix with themes.dark. only for a theme-specific change." }, value: { type: ["string", "number", "boolean"] }, reason: { type: "string" } }, required: ["path", "value"], additionalProperties: false } },
            tokenAdds: { type: "array", description: "Reviewed new semantic token paths. Supply a value for every existing theme; new token additions require at least a MINOR version impact.", items: { type: "object", properties: { path: { type: "string" }, values: { type: "object", additionalProperties: { type: ["string", "number", "boolean"] } }, reason: { type: "string" } }, required: ["path", "values"], additionalProperties: false } },
            componentUpdates: { type: "array", items: { type: "object", properties: { name: { type: "string" }, content: { type: "string", description: "Full semantically revised Markdown for an affected existing component." } }, required: ["name", "content"], additionalProperties: false } },
            patternUpdates: { type: "array", items: { type: "object", properties: { name: { type: "string" }, content: { type: "string", description: "Full semantically revised Markdown for an affected existing pattern." } }, required: ["name", "content"], additionalProperties: false } },
            newComponents: { type: "array", items: componentSchema },
            newPatterns: { type: "array", items: patternSchema },
            preferenceUpdates: { type: "array", items: preferenceSchema },
            foundationUpdate: { type: "string" },
            decision: { type: "string" },
            impact: { type: "string", enum: ["patch", "minor", "major"] },
            status: { type: "string", enum: ["draft", "review", "stable"] },
          },
          required: ["request", "tokenUpdates", "decision", "impact"],
          additionalProperties: false,
        },
        execute: async (raw) => ({ content: JSON.stringify(await updateDesignSystem(projectRoot, raw as unknown as UpdateInput), null, 2) }),
      })
      editor.add({
        name: "preview",
        description: "Regenerate the self-contained interactive HTML preview from the current structured Design System files.",
        options: { namespace: "design_system", codemode: true },
        input: { type: "object", properties: {}, additionalProperties: false },
        execute: async () => ({ content: JSON.stringify(await regeneratePreview(projectRoot), null, 2) }),
      })
      editor.add({
        name: "check",
        description: "Read-only heuristic check for UI color literals, border radii, button heights, and inconsistencies not represented by existing Design System tokens.",
        options: { namespace: "design_system", codemode: true },
        input: { type: "object", properties: {}, additionalProperties: false },
        execute: async () => ({ content: JSON.stringify(await checkProject(projectRoot), null, 2) }),
      })
      editor.add({
        name: "screen_spec",
        description: "Save an implementation-ready, framework-neutral screen design brief to design-system/screens/<name>.md without modifying application code.",
        options: { namespace: "design_system", codemode: true },
        input: {
          type: "object",
          properties: {
            name: { type: "string" },
            specification: { type: "string", description: "Purpose, layout, hierarchy, components/tokens, data, states, interactions, responsive behavior, and accessibility." },
          },
          required: ["name", "specification"],
          additionalProperties: false,
        },
        execute: async (raw) => ({ content: JSON.stringify(await saveScreenSpec(projectRoot, String((raw as { name: string }).name), String((raw as { specification: string }).specification)), null, 2) }),
      })
    })

    return () => undefined
  },
})

const preferenceSchema = {
  type: "object",
  properties: {
    key: { type: "string" },
    value: { type: ["string", "number", "boolean"] },
    explicit: { type: "boolean" },
    rationale: { type: "string" },
  },
  required: ["key", "value"],
  additionalProperties: false,
}

const componentSchema = {
  type: "object",
  properties: {
    name: { type: "string" }, purpose: { type: "string" }, variants: stringArray(), sizes: stringArray(), tokens: stringArray(),
    states: stringArray(), behavior: { type: "string" }, accessibility: { type: "string" }, responsive: { type: "string" },
    useWhen: { type: "string" }, avoidWhen: { type: "string" }, related: stringArray(),
  },
  required: ["name", "purpose"],
  additionalProperties: false,
}

const patternSchema = {
  type: "object",
  properties: {
    name: { type: "string" }, purpose: { type: "string" }, composition: stringArray(), behavior: { type: "string" },
    responsive: { type: "string" }, accessibility: { type: "string" }, guidance: { type: "string" }, tokens: stringArray(),
  },
  required: ["name", "purpose"],
  additionalProperties: false,
}

function stringArray() {
  return { type: "array", items: { type: "string" } }
}

async function readRelevantSystem(root: string, task: string): Promise<Record<string, unknown>> {
  try {
    const manifest = await readManifest(root)
    const tokenDoc = await readJson<Record<string, unknown>>(root, `${DESIGN_SYSTEM_DIR}/${manifest.tokens}`)
    const preferences = await readJson<unknown>(root, `${DESIGN_SYSTEM_DIR}/${manifest.preferences}`)
    const guidelines = await readText(root, `${DESIGN_SYSTEM_DIR}/${manifest.guidelines}`)
    const foundations = await readText(root, `${DESIGN_SYSTEM_DIR}/${manifest.foundations}`)
    const decisions = await readText(root, `${DESIGN_SYSTEM_DIR}/${manifest.decisions}`)
    const terms = `${task} ${taskTerms(task)}`.toLowerCase()
    const componentEntries = manifest.components.filter((item) => terms.includes(item.name.toLowerCase()) || item.tokens.some((token) => terms.split(/\W+/).some((term) => term.length > 3 && token.includes(term))))
    const patternEntries = manifest.patterns.filter((item) => terms.includes(item.name.toLowerCase()))
    for (const item of manifest.components) {
      if (componentEntries.includes(item)) continue
      if (await fileExists(root, `${DESIGN_SYSTEM_DIR}/${item.file}`)) {
        const summary = (await readText(root, `${DESIGN_SYSTEM_DIR}/${item.file}`)).toLowerCase()
        if (summary.split(/\W+/).some((term) => term.length > 4 && terms.includes(term))) componentEntries.push(item)
      }
    }
    for (const item of manifest.patterns) {
      if (patternEntries.includes(item)) continue
      if (await fileExists(root, `${DESIGN_SYSTEM_DIR}/${item.file}`)) {
        const summary = (await readText(root, `${DESIGN_SYSTEM_DIR}/${item.file}`)).toLowerCase()
        if (summary.split(/\W+/).some((term) => term.length > 4 && terms.includes(term))) patternEntries.push(item)
      }
    }
    if (!componentEntries.length) componentEntries.push(...manifest.components.slice(0, 5))
    if (!patternEntries.length) patternEntries.push(...manifest.patterns.slice(0, 3))
    const components = await Promise.all(componentEntries.slice(0, 8).map(async (item) => ({ ...item, content: await readText(root, `${DESIGN_SYSTEM_DIR}/${item.file}`) })))
    const patterns = await Promise.all(patternEntries.slice(0, 5).map(async (item) => ({ ...item, content: await readText(root, `${DESIGN_SYSTEM_DIR}/${item.file}`) })))
    const preferredPaths = new Set([...components, ...patterns].flatMap((item) => item.tokens))
    const selectedTokens = selectTokens(tokenDoc, task, preferredPaths, 90)
    const relevantFoundations = selectFoundationSections(foundations, task)
    return {
      exists: true,
      progressiveLoading: true,
      manifest: {
        designSystemVersion: manifest.designSystemVersion,
        schemaVersion: manifest.schemaVersion,
        status: manifest.status,
        name: manifest.name,
        source: manifest.source,
        themes: manifest.themes,
        components: manifest.components,
        patterns: manifest.patterns,
        files: { tokens: manifest.tokens, foundations: manifest.foundations, guidelines: manifest.guidelines, preferences: manifest.preferences, decisions: manifest.decisions },
      },
      guidelines,
      preferences,
      decisions: decisions.slice(-5000),
      foundations: relevantFoundations,
      tokens: selectedTokens,
      components,
      patterns,
      excluded: manifest.components.filter((item) => !componentEntries.includes(item)).map((item) => item.name),
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      return { exists: false, error: error instanceof Error ? error.message : String(error), nextStep: "Use design_system_analyze if documenting an existing app, or create a new Design System first." }
    }
    return { exists: false, nextStep: "Use design_system_analyze if the project already has UI, or ask for the user's visual direction before creating a new system." }
  }
}

function taskTerms(task: string): string {
  const lower = task.toLowerCase()
  const groups: Array<[RegExp, string]> = [
    [/form|login|sign.?in|settings|input|field|validation|filter|search/, "button input textarea select checkbox radio switch form"],
    [/table|list|admin|management|users|records/, "table pagination card badge navigation sidebar"],
    [/nav|menu|header|sidebar|breadcrumb/, "navigation menu header sidebar breadcrumb"],
    [/modal|dialog|confirm|delete|destructive/, "modal drawer alert button"],
    [/empty|loading|error|success|toast/, "empty state loading skeleton alert toast"],
  ]
  return groups.filter(([pattern]) => pattern.test(lower)).map(([, terms]) => terms).join(" ")
}

function selectTokens(document: Record<string, unknown>, task: string, preferredPaths: Set<string>, limit: number): unknown {
  const themes = (document.themes ?? {}) as Record<string, unknown>
  const taskTermsLower = `${task} ${taskTerms(task)}`.toLowerCase()
  const selected: Record<string, unknown> = { schemaVersion: document.schemaVersion, themes: {} }
  for (const [themeName, value] of Object.entries(themes)) {
    if (!value || typeof value !== "object") continue
    const theme: Record<string, unknown> = {}
    let remaining = limit
    for (const group of Object.keys(value as object)) {
      const flattened = flatten((value as Record<string, unknown>)[group], group)
      const candidates = flattened.filter(({ path: tokenPath }) => preferredPaths.has(tokenPath) || tokenPath.split(".").some((part) => part.length > 3 && taskTermsLower.includes(part.toLowerCase())))
      const baseline = flattened.filter(({ path: tokenPath }) => baselineTokenPath(tokenPath))
      const chosen = (candidates.length ? candidates : baseline).slice(0, remaining)
      if (chosen.length) {
        theme[group] = unflattenGroup(chosen)
        remaining -= chosen.length
      }
      if (remaining <= 0) break
    }
    ;(selected.themes as Record<string, unknown>)[themeName] = theme
    if (remaining <= 0) break
  }
  return selected
}

function baselineTokenPath(tokenPath: string): boolean {
  return /^color\.(?:surface\.(?:base|raised)|text\.(?:primary|secondary)|accent\.primary|border\.subtle|focus\.ring)$/.test(tokenPath)
    || /^spacing\.(?:xs|sm|md|lg|control)$/.test(tokenPath)
    || /^radius\.(?:control|card|sm|md|lg)$/.test(tokenPath)
    || /^typography\.(?:fontFamily\.sans|fontSize\.(?:body|heading|title))$/.test(tokenPath)
    || /^breakpoints\.(?:compact|tablet|wide|desktop)$/.test(tokenPath)
    || /^(?:elevation|motion)\.(?:surface|dialog|popover|duration|easing)$/.test(tokenPath)
}

function flatten(value: unknown, prefix: string): Array<{ path: string; value: unknown }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [{ path: prefix, value }]
  return Object.entries(value).flatMap(([key, item]) => flatten(item, `${prefix}.${key}`))
}

function unflattenGroup(items: Array<{ path: string; value: unknown }>): unknown {
  const result: Record<string, unknown> = {}
  for (const item of items) {
    const parts = item.path.split(".").slice(1)
    let current = result
    parts.forEach((part, index) => {
      if (index === parts.length - 1) current[part] = item.value
      else current = (current[part] ??= {}) as Record<string, unknown>
    })
  }
  return result
}

function selectFoundationSections(markdown: string, task: string): string {
  const relevant = `${task} ${taskTerms(task)}`.toLowerCase().split(/\W+/).filter((term) => term.length > 3)
  const sections = markdown.split(/(?=^#{1,3} )/m)
  const selected = sections.filter((section, index) => {
    if (index === 0) return true
    const heading = section.slice(0, section.indexOf("\n")).toLowerCase()
    return /accessibility|responsive|interaction|state/.test(heading) || relevant.some((term) => heading.includes(term))
  })
  return selected.join("\n").slice(0, 9000)
}

function summarizeAnalysis(analysis: Awaited<ReturnType<typeof analyzeProject>>): Record<string, unknown> {
  return {
    ...analysis,
    styleSources: analysis.styleSources.slice(0, 20).map((item) => ({ ...item, variables: item.variables.slice(0, 20), colors: item.colors.slice(0, 20), radii: item.radii.slice(0, 12) })),
    colors: analysis.colors.slice(0, 20),
    radii: analysis.radii.slice(0, 16),
    spacing: analysis.spacing.slice(0, 18),
    componentCandidates: analysis.componentCandidates.slice(0, 30),
  }
}
