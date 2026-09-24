import type { ComponentDefinition, PatternDefinition, Preference } from "./types.js"

export const AGENTS_START = "<!-- opencode-design-system:start -->"
export const AGENTS_END = "<!-- opencode-design-system:end -->"

export function componentMarkdown(component: ComponentDefinition): string {
  return [
    `# ${component.name}`,
    "",
    `## Purpose\n${component.purpose}`,
    `## Variants\n${list(component.variants)}`,
    `## Sizes\n${list(component.sizes)}`,
    `## Tokens\n${tokenList(component.tokens)}`,
    `## States\n${list(component.states)}`,
    `## Behavior\n${component.behavior || "Follow the platform's expected interaction model."}`,
    `## Accessibility\n${component.accessibility || "Use semantic elements, keyboard interaction, visible focus, and accessible names."}`,
    `## Responsive\n${component.responsive || "Adapt to the available space without losing content or functionality."}`,
    `## Use when\n${component.useWhen || component.purpose}`,
    `## Avoid when\n${component.avoidWhen || "A simpler existing component or pattern already fits."}`,
    `## Related components\n${list(component.related)}`,
  ].join("\n\n").trimEnd() + "\n"
}

export function patternMarkdown(pattern: PatternDefinition): string {
  return [
    `# ${pattern.name}`,
    "",
    `## Purpose\n${pattern.purpose}`,
    `## Composition\n${list(pattern.composition)}`,
    `## Behavior\n${pattern.behavior || "Keep the sequence clear and preserve user input when recovering from errors."}`,
    `## Responsive\n${pattern.responsive || "Reflow the pattern for narrow screens while preserving task priority."}`,
    `## Accessibility\n${pattern.accessibility || "Use semantic structure, keyboard access, clear labels, and announced feedback."}`,
    `## Guidance\n${pattern.guidance || pattern.purpose}`,
    `## Tokens\n${tokenList(pattern.tokens)}`,
  ].join("\n\n").trimEnd() + "\n"
}

export function aiGuidelines(name: string, preferences: Preference[]): string {
  const explicit = preferences.filter((item) => item.explicit)
  const preferenceLines = explicit.length
    ? explicit.map((item) => `- **${item.key}:** ${formatPreference(item.value)}${item.rationale ? ` — ${item.rationale}` : ""}`).join("\n")
    : "- Treat documented foundations and decisions as the project's visual contract."
  return `# AI Guidelines — ${name}

These instructions are the operational contract for any agent that designs or implements this project's UI.

## Load only what the task needs

1. Read [manifest.json](manifest.json) to discover current files and status.
2. Read the relevant portions of [AI-GUIDELINES.md](AI-GUIDELINES.md), [FOUNDATIONS.md](FOUNDATIONS.md), and [preferences.json](preferences.json).
3. Read only the component and pattern documents related to the requested screen or change. Use their token lists to identify relevant values in [tokens.json](tokens.json).
4. Do not load unrelated component documentation or the generated preview source as design authority.

## Non-negotiable rules

- Use existing semantic tokens. Do not invent colors, spacing, typography, radius, elevations, breakpoints, or motion values when an appropriate token exists.
- Honor explicit user preferences below and in [preferences.json](preferences.json). Suggestions or accessibility notes may explain tradeoffs, but never silently override a stated preference.
- Never introduce a forbidden visual treatment. Keep deliberate identity choices distinct from technical recommendations.
- Reuse and compose documented components before adding a new visual primitive. If a reusable component is missing, propose composition or document the component addition before treating it as part of the system.
- Follow component states, responsive behavior, interaction, and accessibility guidance. Provide visible focus and preserve keyboard operation.
- Keep application implementation framework-neutral in design decisions; framework adapters are implementation details, not the source of truth.
- Keep screen design and code implementation distinct. A screen brief belongs in [screens/](screens/); do not create application code when the task only asks for a design specification.
- Do not alter existing application components as part of Design System analysis or generation unless explicitly asked.
- When the system status is **draft** or **review**, communicate unresolved decisions rather than presenting them as settled.
- When changing the system without its plugin, edit the existing semantic token paths and affected specifications deliberately, record the decision, update the version and changelog, then run the included Node.js preview generator. Never treat regenerated HTML as input data.

## Explicit user preferences

${preferenceLines}

## Conflict handling

If a request conflicts with an explicit preference or the current system, identify the exact conflict and ask whether the user wants to change the system. For ambiguous identity decisions, ask a small, natural follow-up question. Resolve technical consequences from the documented system without asking about every implementation detail.
`
}

export function projectAgentsBlock(systemName: string): string {
  return `${AGENTS_START}
## Project Design System: ${systemName}

This repository has a framework-neutral Design System at [design-system/manifest.json](design-system/manifest.json). Before creating or changing UI, read [design-system/AI-GUIDELINES.md](design-system/AI-GUIDELINES.md) and discover the relevant tokens, components, and patterns through the manifest. Load only task-relevant documents; the structured Markdown and JSON files are authoritative, and [design-system/preview/index.html](design-system/preview/index.html) is generated visualization only.

Honor explicit decisions in [design-system/preferences.json](design-system/preferences.json) and [design-system/DECISIONS.md](design-system/DECISIONS.md). Do not add arbitrary visual values or redesign existing identity during analysis. A screen brief is a design artifact in [design-system/screens/](design-system/screens/); implementation is a separate step. This guidance is intentionally tool- and framework-independent: any coding agent can use the Design System without this plugin or project-local copies of plugin agents, commands, or skills.
${AGENTS_END}`
}

function list(items?: string[]): string {
  return items?.length ? items.map((item) => `- ${item}`).join("\n") : "- None specified."
}

function tokenList(items?: string[]): string {
  return items?.length ? items.map((item) => "- `" + item + "`").join("\n") : "- No direct token references declared."
}

function formatPreference(value: string | boolean | number): string {
  return typeof value === "string" ? `“${value}”` : `\`${String(value)}\``
}
