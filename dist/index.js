// src/index.ts
import { existsSync } from "fs";
import path5 from "path";
import { Plugin } from "@opencode/plugin";

// src/generator.ts
import { mkdir as mkdir2, readFile as readFile2, readdir, rename as rename2, rm as rm2, writeFile as writeFile2 } from "fs/promises";
import path3 from "path";
import { randomUUID as randomUUID2 } from "crypto";

// src/paths.ts
import path from "path";
var DESIGN_SYSTEM_DIR = "design-system";
function resolveInside(root, relativePath) {
  if (path.isAbsolute(relativePath)) throw new Error(`Absolute paths are not allowed: ${relativePath}`);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Path escapes the project directory: ${relativePath}`);
  }
  return resolved;
}
function slugify(value) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

// src/content.ts
var AGENTS_START = "<!-- opencode-design-system:start -->";
var AGENTS_END = "<!-- opencode-design-system:end -->";
function componentMarkdown(component) {
  return [
    `# ${component.name}`,
    "",
    `## Purpose
${component.purpose}`,
    `## Variants
${list(component.variants)}`,
    `## Sizes
${list(component.sizes)}`,
    `## Tokens
${tokenList(component.tokens)}`,
    `## States
${list(component.states)}`,
    `## Behavior
${component.behavior || "Follow the platform's expected interaction model."}`,
    `## Accessibility
${component.accessibility || "Use semantic elements, keyboard interaction, visible focus, and accessible names."}`,
    `## Responsive
${component.responsive || "Adapt to the available space without losing content or functionality."}`,
    `## Use when
${component.useWhen || component.purpose}`,
    `## Avoid when
${component.avoidWhen || "A simpler existing component or pattern already fits."}`,
    `## Related components
${list(component.related)}`
  ].join("\n\n").trimEnd() + "\n";
}
function patternMarkdown(pattern) {
  return [
    `# ${pattern.name}`,
    "",
    `## Purpose
${pattern.purpose}`,
    `## Composition
${list(pattern.composition)}`,
    `## Behavior
${pattern.behavior || "Keep the sequence clear and preserve user input when recovering from errors."}`,
    `## Responsive
${pattern.responsive || "Reflow the pattern for narrow screens while preserving task priority."}`,
    `## Accessibility
${pattern.accessibility || "Use semantic structure, keyboard access, clear labels, and announced feedback."}`,
    `## Guidance
${pattern.guidance || pattern.purpose}`,
    `## Tokens
${tokenList(pattern.tokens)}`
  ].join("\n\n").trimEnd() + "\n";
}
function aiGuidelines(name, preferences) {
  const explicit = preferences.filter((item) => item.explicit);
  const preferenceLines = explicit.length ? explicit.map((item) => `- **${item.key}:** ${formatPreference(item.value)}${item.rationale ? ` \u2014 ${item.rationale}` : ""}`).join("\n") : "- Treat documented foundations and decisions as the project's visual contract.";
  return `# AI Guidelines \u2014 ${name}

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
`;
}
function projectAgentsBlock(systemName) {
  return `${AGENTS_START}
## Project Design System: ${systemName}

This repository has a framework-neutral Design System at [design-system/manifest.json](design-system/manifest.json). Before creating or changing UI, read [design-system/AI-GUIDELINES.md](design-system/AI-GUIDELINES.md) and discover the relevant tokens, components, and patterns through the manifest. Load only task-relevant documents; the structured Markdown and JSON files are authoritative, and [design-system/preview/index.html](design-system/preview/index.html) is generated visualization only.

Honor explicit decisions in [design-system/preferences.json](design-system/preferences.json) and [design-system/DECISIONS.md](design-system/DECISIONS.md). Do not add arbitrary visual values or redesign existing identity during analysis. A screen brief is a design artifact in [design-system/screens/](design-system/screens/); implementation is a separate step. This guidance is intentionally tool- and framework-independent and applies even when the Design System plugin is unavailable.
${AGENTS_END}`;
}
var PORTABLE_SKILL = `---
name: Design System
description: Apply the project's design-system tokens, components, patterns, and accessibility guidance to UI design and implementation.
---

Before any UI task:

1. Check whether design-system/manifest.json exists. If it does not, continue normally without inventing a system.
2. Read the manifest, AI-GUIDELINES.md, and preferences.json. Use manifest paths to discover relevant documents.
3. Load only tokens and component/pattern documents needed by this task. For a form, for example, load input/select/button plus the form pattern; do not read every component.
4. Treat explicit preferences and DECISIONS.md as user-owned constraints. Ask before changing a design identity decision; do not silently override it.
5. Use documented semantic tokens and components; preserve responsive, state, keyboard, focus, and accessibility requirements.
6. For design-only requests, write a screen brief to design-system/screens/<screen-name>.md and do not implement application code unless requested.
7. The preview is generated from structured tokens and specifications. Never use it as the only source of truth.

For larger systems, read only the relevant paths discovered from the manifest and keep unrelated documentation out of context.
`;
var DESIGNER_AGENT = `---
description: Collaborates with users to create and evolve original, accessible UI design systems.
mode: subagent
---

You are a senior UI/UX designer, accessibility specialist, and design-system architect. Collaborate in natural language. Start by understanding the product, audience, desired mood, references, explicit avoidances, platforms, and relevant accessibility needs. Ask only a few high-value questions when identity choices are unclear; offer concrete alternatives in everyday language. Do not turn the process into a long questionnaire, and do not decide identity questions on the user's behalf.

Explicit preferences have priority. Record them structurally, repeat them into AI-GUIDELINES.md, and preserve them in every update. You may explain contrast or usability tradeoffs, but ask before departing from an explicit request. Build an original visual language rather than copying a known design system.

For an existing application, use the read-only project analysis tool when available; otherwise inspect likely UI/style files without changing them. Preserve its recognizable identity by default. Distinguish probable accidents from intentional variants, explain evidence and uncertainty, and ask the user before normalizing ambiguous inconsistencies. Analysis never authorizes changing application files.

When enough direction is known, summarize the proposed direction and ask for confirmation before committing a substantial initial system. Use Design System tools when available; otherwise create the documented Markdown/JSON files directly and use the included preview generator. Keep the system's status as draft/review until the user accepts it. Explain what changed and any unresolved choices.
`;
var SCREEN_AGENT = `---
description: Produces implementation-ready screen specifications using the project's Design System.
mode: subagent
---

You are a UI/UX screen designer. Before designing, check design-system/manifest.json and follow AI-GUIDELINES.md. Load only the tokens, components, and patterns relevant to the requested screen. Understand the user's task, hierarchy, content, states, interactions, responsive behavior, and accessibility. Reuse the system; flag a missing reusable component rather than silently inventing a design language.

Design is separate from code implementation. Produce a concise, implementation-ready Markdown specification with purpose, layout, hierarchy, components and token references, data/content, interactions and states, responsive behavior, and accessibility. Save it under design-system/screens/<kebab-case-name>.md using the screen-spec tool when available; otherwise write the Markdown file directly. Do not write React/Vue/etc. unless the user separately requests implementation. If no system exists, state that and create a coherent brief without claiming it follows a nonexistent system.
`;
function list(items) {
  return items?.length ? items.map((item) => `- ${item}`).join("\n") : "- None specified.";
}
function tokenList(items) {
  return items?.length ? items.map((item) => "- `" + item + "`").join("\n") : "- No direct token references declared.";
}
function formatPreference(value) {
  return typeof value === "string" ? `\u201C${value}\u201D` : `\`${String(value)}\``;
}

// src/io.ts
import { mkdir, readFile, rename, rm, writeFile } from "fs/promises";
import path2 from "path";
import { randomUUID } from "crypto";
async function readText(root, relativePath) {
  return readFile(resolveInside(root, relativePath), "utf8");
}
async function readJson(root, relativePath) {
  return JSON.parse(await readText(root, relativePath));
}
async function fileExists(root, relativePath) {
  try {
    await readFile(resolveInside(root, relativePath));
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
async function atomicWrite(root, relativePath, content) {
  const destination = resolveInside(root, relativePath);
  const directory = path2.dirname(destination);
  await mkdir(directory, { recursive: true });
  const temporary = path2.join(directory, `.${path2.basename(destination)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, content, "utf8");
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => void 0);
    throw error;
  }
}
async function writeIfAbsent(root, relativePath, content) {
  const destination = resolveInside(root, relativePath);
  await mkdir(path2.dirname(destination), { recursive: true });
  try {
    await writeFile(destination, content, { encoding: "utf8", flag: "wx" });
    return true;
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  }
}
async function updateManagedBlock(root, relativePath, startMarker, endMarker, block) {
  let current = "";
  try {
    current = await readText(root, relativePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const start = current.indexOf(startMarker);
  const end = current.indexOf(endMarker);
  let next;
  if (start >= 0 && end >= start) {
    next = `${current.slice(0, start)}${block}${current.slice(end + endMarker.length)}`;
  } else {
    const separator = current.length === 0 || current.endsWith("\n") ? "" : "\n";
    next = `${current}${separator}${current.length ? "\n" : ""}${block}
`;
  }
  await atomicWrite(root, relativePath, next);
}

// src/schema.ts
var manifestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://opencode.design/schema/manifest-1.0.json",
  title: "OpenCode Design System manifest",
  type: "object",
  required: [
    "designSystemVersion",
    "schemaVersion",
    "status",
    "name",
    "description",
    "source",
    "themes",
    "tokens",
    "preferences",
    "foundations",
    "guidelines",
    "decisions",
    "preview",
    "screens",
    "components",
    "patterns"
  ],
  properties: {
    designSystemVersion: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+$" },
    schemaVersion: { type: "string" },
    status: { enum: ["draft", "review", "stable"] },
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    source: {
      type: "object",
      required: ["type"],
      properties: { type: { enum: ["from-scratch", "existing-project"] }, evidence: { type: "array", items: { type: "string" } } }
    },
    themes: { type: "array", items: { type: "string" }, minItems: 1 },
    tokens: { type: "string" },
    preferences: { type: "string" },
    foundations: { type: "string" },
    guidelines: { type: "string" },
    decisions: { type: "string" },
    preview: { type: "string" },
    screens: { type: "string" },
    components: { type: "array", items: { $ref: "#/$defs/document" } },
    patterns: { type: "array", items: { $ref: "#/$defs/document" } }
  },
  $defs: {
    document: {
      type: "object",
      required: ["name", "file", "tokens"],
      properties: { name: { type: "string" }, file: { type: "string" }, tokens: { type: "array", items: { type: "string" } } }
    }
  }
};
var tokensSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://opencode.design/schema/tokens-1.0.json",
  title: "Framework-neutral semantic design tokens",
  type: "object",
  required: ["schemaVersion", "themes"],
  properties: {
    schemaVersion: { type: "string" },
    themes: {
      type: "object",
      minProperties: 1,
      additionalProperties: { type: "object" }
    }
  },
  additionalProperties: true
};
function validateTokens(value) {
  const errors = [];
  if (typeof value.schemaVersion !== "string") errors.push("tokens.schemaVersion must be a string");
  if (!value.themes || typeof value.themes !== "object" || Array.isArray(value.themes)) {
    errors.push("tokens.themes must be an object containing at least one theme");
  } else if (Object.keys(value.themes).length === 0) {
    errors.push("tokens.themes must contain at least one theme");
  }
  const themes = value.themes;
  for (const [name, theme] of Object.entries(themes ?? {})) {
    if (!theme || typeof theme !== "object" || Array.isArray(theme)) errors.push(`tokens.themes.${name} must be an object`);
  }
  return errors;
}

// src/preview.ts
function createPreviewHtml(input) {
  const { manifest, tokens, components, patterns } = input;
  const themes = tokens.themes ?? {};
  const firstTheme = Object.keys(themes)[0] ?? "light";
  const themePayload = safeJson(themes);
  const componentCards = components.map((component) => `
    <article class="spec-card">
      <div class="spec-heading"><div><p class="eyebrow">Component</p><h3>${escapeHtml(component.name)}</h3></div><span class="tag">${escapeHtml(component.variants?.[0] ?? "base")}</span></div>
      <p>${escapeHtml(component.purpose)}</p>
      <div class="showcase">
        ${component.name.toLowerCase().includes("button") ? `<button class="button" type="button">${escapeHtml(component.name)}</button><button class="button secondary" type="button">Secondary</button><button class="button" type="button" disabled>Disabled</button>` : component.name.toLowerCase().includes("input") || component.name.toLowerCase().includes("search") ? `<label class="field-label">${escapeHtml(component.name)}<input type="text" placeholder="Enter a value" /></label><label class="field-label">Error state<input class="field-error" aria-invalid="true" value="Check this value" /></label>` : `<button class="button secondary" type="button">${escapeHtml(component.name)} example</button>`}
      </div>
      ${component.tokens?.length ? `<small>Tokens: ${component.tokens.map((token) => `<code>${escapeHtml(token)}</code>`).join(" ")}</small>` : ""}
    </article>`).join("\n");
  const patternCards = patterns.map((pattern) => `
    <article class="spec-card"><p class="eyebrow">Pattern</p><h3>${escapeHtml(pattern.name)}</h3><p>${escapeHtml(pattern.purpose)}</p><p class="muted">${escapeHtml(pattern.guidance ?? pattern.composition?.join(" \xB7 ") ?? "")}</p></article>`).join("\n");
  const componentIndex = manifest.components.map((item) => `<li><a href="../${escapeHtml(item.file)}">${escapeHtml(item.name)}</a></li>`).join("");
  const patternIndex = manifest.patterns.map((item) => `<li><a href="../${escapeHtml(item.file)}">${escapeHtml(item.name)}</a></li>`).join("");
  return `<!doctype html>
<html lang="en" data-theme="${escapeHtml(firstTheme)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="Generated interactive preview for ${escapeHtml(manifest.name)}." />
  <title>${escapeHtml(manifest.name)} \u2014 Design System</title>
  <style>
    :root{font-family:var(--typography-font-family-sans,Inter,ui-sans-serif,system-ui,sans-serif);color:var(--color-text-primary,#17211f);background:var(--color-surface-base,#f6f8f7);font-synthesis:none;font-optical-sizing:auto;line-height:1.5}
    *{box-sizing:border-box}body{margin:0;background:var(--color-surface-base,#f6f8f7);color:var(--color-text-primary,#17211f)}button,input,select{font:inherit}button{cursor:pointer}a{color:var(--color-accent-primary,#236b55)}
    .shell{min-height:100vh;display:grid;grid-template-columns:250px minmax(0,1fr)}.sidebar{padding:28px 20px;border-right:1px solid var(--color-border-subtle,#dbe2de);background:var(--color-surface-raised,#fff)}.brand{font-size:1.05rem;font-weight:750;margin-bottom:4px}.side-note,.muted{color:var(--color-text-secondary,#65726d);font-size:.88rem}.nav{display:grid;gap:6px;margin:28px 0}.nav a{padding:8px 10px;text-decoration:none;border-radius:var(--radius-control,6px);color:var(--color-text-secondary,#65726d)}.nav a:hover{background:var(--color-surface-base,#f6f8f7);color:var(--color-text-primary,#17211f)}.nav-label{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--color-text-secondary,#65726d);margin:20px 8px 8px}
    main{min-width:0;padding:34px clamp(20px,5vw,72px) 72px;max-width:1440px}.topbar{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:34px}.eyebrow{font-size:.72rem;text-transform:uppercase;letter-spacing:.1em;font-weight:700;color:var(--color-text-secondary,#65726d);margin:0 0 5px}.hero h1{font-size:clamp(2rem,4vw,3.4rem);letter-spacing:-.045em;line-height:1.08;margin:0}.hero>p{max-width:720px;color:var(--color-text-secondary,#65726d)}.status{display:inline-flex;border:1px solid var(--color-border-subtle,#dbe2de);border-radius:999px;padding:3px 10px;font-size:.76rem;text-transform:uppercase;letter-spacing:.06em}
    section{margin-top:54px;scroll-margin-top:20px}.section-heading{display:flex;justify-content:space-between;align-items:end;gap:16px;border-bottom:1px solid var(--color-border-subtle,#dbe2de);padding-bottom:12px;margin-bottom:18px}.section-heading h2{margin:0;font-size:1.45rem;letter-spacing:-.025em}.section-heading p{margin:0;color:var(--color-text-secondary,#65726d);font-size:.9rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:14px}.spec-card,.surface{border:1px solid var(--color-border-subtle,#dbe2de);border-radius:var(--radius-card,10px);background:var(--color-surface-raised,#fff);padding:18px}.spec-card h3{margin:0 0 8px;font-size:1.05rem}.spec-card p{color:var(--color-text-secondary,#65726d);margin:8px 0}.spec-card small{display:block;margin-top:12px;color:var(--color-text-secondary,#65726d)}.spec-heading{display:flex;justify-content:space-between;align-items:center;gap:12px}.tag{border-radius:var(--radius-tag,4px);background:var(--color-accent-subtle,#e6f0eb);color:var(--color-accent-primary,#236b55);padding:3px 8px;font-size:.75rem}.showcase{display:flex;align-items:end;gap:10px;flex-wrap:wrap;margin:16px 0 4px}.button{border:1px solid var(--color-accent-primary,#236b55);border-radius:var(--radius-control,6px);background:var(--color-accent-primary,#236b55);color:var(--color-on-accent,#fff);padding:9px 14px;min-height:40px;font-weight:650;transition:background 140ms ease,border-color 140ms ease,transform 140ms ease}.button:hover{filter:brightness(.94)}.button:active{transform:translateY(1px)}.button:focus-visible,input:focus-visible,select:focus-visible,.tab:focus-visible{outline:3px solid var(--color-focus-ring,#79b8a0);outline-offset:2px}.button.secondary{background:var(--color-surface-raised,#fff);color:var(--color-text-primary,#17211f);border-color:var(--color-border-strong,#9aa9a1)}.button:disabled{opacity:.5;cursor:not-allowed}.field-label{display:grid;gap:5px;font-size:.82rem;color:var(--color-text-secondary,#65726d)}input,select{min-height:40px;border:1px solid var(--color-border-strong,#9aa9a1);border-radius:var(--radius-control,6px);padding:8px 10px;background:var(--color-surface-base,#f6f8f7);color:var(--color-text-primary,#17211f)}.field-error{border-color:var(--color-status-danger,#b83d48)}code{font-size:.78rem;background:var(--color-surface-base,#f6f8f7);padding:2px 5px;border-radius:3px}.swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}.swatch{min-width:0;border:1px solid var(--color-border-subtle,#dbe2de);border-radius:var(--radius-control,6px);overflow:hidden;background:var(--color-surface-raised,#fff)}.swatch-color{height:68px;background:var(--swatch,#ddd);border-bottom:1px solid var(--color-border-subtle,#dbe2de)}.swatch-label{padding:8px 10px;font-size:.78rem}.swatch-label code{display:block;overflow-wrap:anywhere;background:none;padding:2px 0;color:var(--color-text-secondary,#65726d)}.tabs{display:flex;gap:4px;border-bottom:1px solid var(--color-border-subtle,#dbe2de);margin-bottom:14px}.tab{border:0;border-bottom:2px solid transparent;background:transparent;color:var(--color-text-secondary,#65726d);padding:9px 12px}.tab[aria-selected=true]{border-bottom-color:var(--color-accent-primary,#236b55);color:var(--color-accent-primary,#236b55);font-weight:700}.tab-panel{padding:12px 0}.table-wrap{overflow:auto;border:1px solid var(--color-border-subtle,#dbe2de);border-radius:var(--radius-card,10px)}table{width:100%;border-collapse:collapse;background:var(--color-surface-raised,#fff)}th,td{text-align:left;padding:11px 14px;border-bottom:1px solid var(--color-border-subtle,#dbe2de);white-space:nowrap}th{color:var(--color-text-secondary,#65726d);font-size:.78rem}.switch-row{display:flex;align-items:center;gap:12px}.switch{width:42px;height:24px;border:0;border-radius:999px;background:var(--color-border-strong,#9aa9a1);padding:3px}.switch:before{content:"";display:block;width:18px;height:18px;border-radius:50%;background:white;transition:transform .16s}.switch[aria-checked=true]{background:var(--color-accent-primary,#236b55)}.switch[aria-checked=true]:before{transform:translateX(18px)}.overlay{position:fixed;inset:0;display:none;place-items:center;background:rgba(12,22,18,.48);padding:20px;z-index:5}.overlay.open{display:grid}.dialog{width:min(100%,480px);padding:24px;background:var(--color-surface-raised,#fff);color:var(--color-text-primary,#17211f);border:1px solid var(--color-border-subtle,#dbe2de);border-radius:var(--radius-dialog,12px);box-shadow:var(--elevation-dialog,0 18px 60px rgba(0,0,0,.2))}.dialog h3{margin-top:0}.toast{position:fixed;right:24px;bottom:24px;display:none;padding:12px 16px;border-radius:var(--radius-control,6px);background:var(--color-text-primary,#17211f);color:var(--color-surface-raised,#fff);box-shadow:var(--elevation-popover,0 8px 24px rgba(0,0,0,.18));z-index:7}.toast.show{display:block}.token-table{display:grid;gap:16px}.token-group h3{font-size:1rem;margin-bottom:8px}.footer{margin-top:56px;padding-top:16px;border-top:1px solid var(--color-border-subtle,#dbe2de);color:var(--color-text-secondary,#65726d);font-size:.83rem}
    .token-demo{height:68px;display:flex;align-items:center;justify-content:center;background:var(--color-surface-base,#f6f8f7);border-bottom:1px solid var(--color-border-subtle,#dbe2de);overflow:hidden}.token-demo-sample{display:block;background:var(--color-accent-primary,#236b55);min-width:12px;min-height:8px}.token-demo[data-group="typography"] .token-demo-sample{min-width:0;min-height:0;background:transparent;color:var(--color-text-primary,#17211f)}
    @media(max-width:760px){.shell{grid-template-columns:1fr}.sidebar{border-right:0;border-bottom:1px solid var(--color-border-subtle,#dbe2de);padding:14px 18px}.nav{display:flex;overflow:auto;margin:12px 0 0}.nav a{white-space:nowrap}.sidebar .nav-label,.sidebar .side-note,.sidebar ul{display:none}main{padding:24px 18px 54px}.topbar{align-items:flex-start}.component-nav{display:none}}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition-duration:.01ms!important;animation-duration:.01ms!important;animation-iteration-count:1!important}}
  </style>
</head>
<body>
  <div class="shell">
    <aside class="sidebar" aria-label="Design system navigation">
      <div class="brand">${escapeHtml(manifest.name)}</div><div class="side-note">Design system \xB7 v${escapeHtml(manifest.designSystemVersion)}</div>
      <nav class="nav"><a href="#overview">Overview</a><a href="#colors">Tokens</a><a href="#components">Components</a><a href="#patterns">Patterns</a><a href="#interactions">Interactions</a></nav>
      ${manifest.components.length ? `<div class="nav-label">Components</div><ul class="component-nav">${componentIndex}</ul>` : ""}
      ${manifest.patterns.length ? `<div class="nav-label">Patterns</div><ul class="component-nav">${patternIndex}</ul>` : ""}
    </aside>
    <main>
      <div class="topbar"><div class="status">${escapeHtml(manifest.status)}</div><div><button class="button secondary" id="theme-toggle" type="button">Toggle theme</button></div></div>
      <header id="overview" class="hero"><p class="eyebrow">Framework-neutral design language</p><h1>${escapeHtml(manifest.name)}</h1><p>${escapeHtml(manifest.description)}</p></header>
      <section id="colors"><div class="section-heading"><div><p class="eyebrow">Foundations</p><h2>Semantic tokens</h2></div><p>Values generated from tokens.json</p></div><div id="token-groups" class="token-table"></div></section>
      <section id="components"><div class="section-heading"><div><p class="eyebrow">Building blocks</p><h2>Components</h2></div><p>${components.length} documented</p></div><div class="grid">${componentCards || `<p class="muted">No components documented yet.</p>`}</div></section>
      <section id="patterns"><div class="section-heading"><div><p class="eyebrow">Compositions</p><h2>Patterns</h2></div><p>${patterns.length} documented</p></div><div class="grid">${patternCards || `<p class="muted">No patterns documented yet.</p>`}</div></section>
      <section id="interactions"><div class="section-heading"><div><p class="eyebrow">Try it</p><h2>Interactive states</h2></div><p>Keyboard-accessible examples</p></div>
        <div class="grid">
          <article class="spec-card"><h3>Tabs</h3><div class="tabs" role="tablist" aria-label="Preview tabs"><button class="tab" role="tab" aria-selected="true" aria-controls="tab-a" id="tab-button-a">General</button><button class="tab" role="tab" aria-selected="false" aria-controls="tab-b" id="tab-button-b" tabindex="-1">Advanced</button></div><div id="tab-a" class="tab-panel" role="tabpanel" aria-labelledby="tab-button-a">General settings are visible.</div><div id="tab-b" class="tab-panel" role="tabpanel" aria-labelledby="tab-button-b" hidden>Advanced options are available here.</div></article>
          <article class="spec-card"><h3>Switch</h3><div class="switch-row"><button class="switch" type="button" role="switch" aria-checked="false" aria-label="Enable notifications"></button><span>Enable notifications</span></div></article>
          <article class="spec-card"><h3>Dialog and toast</h3><div class="showcase"><button class="button" type="button" id="open-dialog">Open dialog</button><button class="button secondary" type="button" id="show-toast">Show toast</button></div></article>
          <article class="spec-card"><h3>Data table</h3><div class="table-wrap"><table><thead><tr><th>Name</th><th>Status</th><th>Role</th></tr></thead><tbody><tr><td>Jordan Lee</td><td><span class="tag">Active</span></td><td>Editor</td></tr><tr><td>Sam Rivera</td><td>Invited</td><td>Admin</td></tr></tbody></table></div></article>
        </div>
      </section>
      <footer class="footer">Generated from manifest.json, tokens.json, component specifications, and patterns. Edit the structured sources and regenerate this preview; do not edit generated markup as system truth.</footer>
    </main>
  </div>
  <div class="overlay" id="dialog-overlay" aria-hidden="true"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h3 id="dialog-title">Confirm an action</h3><p>This dialog demonstrates the documented surface and focus treatment.</p><div class="showcase"><button class="button" type="button" id="close-dialog">Continue</button><button class="button secondary" type="button" id="cancel-dialog">Cancel</button></div></section></div>
  <div class="toast" id="toast" role="status" aria-live="polite">Changes saved</div>
  <script type="application/json" id="theme-data">${themePayload}</script>
  <script>
    const themes=JSON.parse(document.getElementById('theme-data').textContent||'{}');
    function flatten(value,prefix='',out={}){for(const [key,item] of Object.entries(value||{})){const name=prefix?prefix+'-'+key:key;if(item&&typeof item==='object'&&!Array.isArray(item))flatten(item,name,out);else if(['string','number'].includes(typeof item))out[name]=String(item)}return out}
    function setTheme(name){const theme=themes[name];if(!theme)return;document.documentElement.dataset.theme=name;for(const [key,value] of Object.entries(flatten(theme)))document.documentElement.style.setProperty('--'+key,value);document.getElementById('theme-toggle').hidden=Object.keys(themes).length<2;renderTokens(theme)}
    function renderTokens(theme){const holder=document.getElementById('token-groups');holder.replaceChildren();for(const [group,values] of Object.entries(theme)){if(!values||typeof values!=='object')continue;const section=document.createElement('div');section.className='token-group';const heading=document.createElement('h3');heading.textContent=group;section.append(heading);const swatches=document.createElement('div');swatches.className='swatches';for(const [name,value] of Object.entries(flatten(values,group))){const card=document.createElement('div');card.className='swatch';const sample=document.createElement('div');if(group==='color'){sample.className='swatch-color';sample.style.background=String(value)}else{sample.className='token-demo';sample.dataset.group=group;const shape=document.createElement('span');shape.className='token-demo-sample';shape.textContent=group==='typography'?'Aa':'';if(group==='spacing')shape.style.width=String(value);if(group==='radius'){shape.style.width='42px';shape.style.height='28px';shape.style.borderRadius=String(value)}if(group==='typography'&&/family/i.test(name))shape.style.fontFamily=String(value);if(group==='typography'&&/size/i.test(name))shape.style.fontSize=String(value);if(group==='elevation')shape.style.boxShadow=String(value);sample.append(shape)}const label=document.createElement('div');label.className='swatch-label';label.textContent=name;const code=document.createElement('code');code.textContent=String(value);label.append(code);card.append(sample,label);swatches.append(card)}section.append(swatches);holder.append(section)}}
    document.getElementById('theme-toggle').addEventListener('click',()=>{const names=Object.keys(themes);const index=names.indexOf(document.documentElement.dataset.theme);setTheme(names[(index+1)%names.length])});
    for(const button of document.querySelectorAll('[role=tab]'))button.addEventListener('click',()=>{for(const tab of document.querySelectorAll('[role=tab]')){const selected=tab===button;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;document.getElementById(tab.getAttribute('aria-controls')).hidden=!selected}});
    for(const tab of document.querySelectorAll('[role=tab]'))tab.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const tabs=[...document.querySelectorAll('[role=tab]')];const next=(tabs.indexOf(tab)+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length;tabs[next].focus();tabs[next].click()});
    document.querySelector('[role=switch]').addEventListener('click',event=>{const control=event.currentTarget;control.setAttribute('aria-checked',String(control.getAttribute('aria-checked')!=='true'))});
    const overlay=document.getElementById('dialog-overlay');const open=document.getElementById('open-dialog');function closeDialog(){overlay.classList.remove('open');overlay.setAttribute('aria-hidden','true');open.focus()}open.addEventListener('click',()=>{overlay.classList.add('open');overlay.setAttribute('aria-hidden','false');document.getElementById('close-dialog').focus()});document.getElementById('close-dialog').addEventListener('click',closeDialog);document.getElementById('cancel-dialog').addEventListener('click',closeDialog);overlay.addEventListener('click',event=>{if(event.target===overlay)closeDialog()});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&overlay.classList.contains('open'))closeDialog()});
    let toastTimeout;document.getElementById('show-toast').addEventListener('click',()=>{const toast=document.getElementById('toast');toast.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>toast.classList.remove('show'),2200)});
    setTheme(${safeJson(firstTheme)});
  </script>
</body>
</html>
`;
}
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
function safeJson(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => ({ "<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "\u2028": "\\u2028", "\u2029": "\\u2029" })[character]);
}

// src/generator.ts
var SCHEMA_VERSION = "1.0.0";
var INITIAL_VERSION = "0.1.0";
async function createDesignSystem(root, input) {
  validateCreateInput(input);
  const target = resolveInside(root, DESIGN_SYSTEM_DIR);
  let existingEntries = [];
  try {
    existingEntries = await readdir(target);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (existingEntries.length > 0) {
    if (await fileExists(root, `${DESIGN_SYSTEM_DIR}/manifest.json`)) {
      throw new Error("A Design System already exists. Use design_system_read, then /design-system:update.");
    }
    throw new Error("design-system/ already contains user files. Move or review them before creating a system there.");
  }
  const preferences = input.preferences ?? [];
  const tokens = { ...input.tokens, schemaVersion: typeof input.tokens.schemaVersion === "string" ? input.tokens.schemaVersion : SCHEMA_VERSION };
  const themes = tokens.themes;
  const tokenPaths = new Set(Object.values(themes).flatMap((theme) => semanticTokenPaths(theme)));
  const components = normalizeComponents(input.components, tokenPaths);
  const patterns = normalizePatterns(input.patterns, tokenPaths);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const records = (items, folder) => items.map((item) => ({
    name: item.name,
    file: `${folder}/${slugify(item.name)}.md`,
    tokens: item.tokens ?? []
  }));
  const manifest = {
    designSystemVersion: INITIAL_VERSION,
    schemaVersion: SCHEMA_VERSION,
    status: input.status ?? "draft",
    name: input.name.trim(),
    description: input.description.trim(),
    createdAt: now,
    updatedAt: now,
    source: {
      type: input.sourceType ?? "from-scratch",
      ...input.evidence?.length ? { evidence: input.evidence } : {}
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
    patterns: records(patterns, "patterns")
  };
  const tokensDocument = { ...tokens, $schema: "./schema/tokens.schema.json" };
  const manifestDocument = { $schema: "./schema/manifest.schema.json", ...manifest };
  const preferencesDocument = { schemaVersion: SCHEMA_VERSION, preferences };
  const files = /* @__PURE__ */ new Map([
    ["manifest.json", pretty(manifestDocument)],
    ["tokens.json", pretty(tokensDocument)],
    ["preferences.json", pretty(preferencesDocument)],
    ["FOUNDATIONS.md", `${input.foundations.trim()}
`],
    ["AI-GUIDELINES.md", aiGuidelines(manifest.name, preferences)],
    ["DECISIONS.md", initialDecisions(preferences)],
    ["CHANGELOG.md", `# Changelog

## ${INITIAL_VERSION} \u2014 ${now.slice(0, 10)}

- Initial ${manifest.status} Design System specification.
`],
    ["schema/manifest.schema.json", pretty(manifestSchema)],
    ["schema/tokens.schema.json", pretty(tokensSchema)],
    ["README.md", systemReadme(manifest)],
    ["tools/generate-preview.mjs", await readFile2(new URL("../templates/generate-preview.mjs", import.meta.url), "utf8")],
    ["preview/index.html", createPreviewHtml({ manifest, tokens, components, patterns })]
  ]);
  for (const [index, component] of components.entries()) files.set(manifest.components[index].file, componentMarkdown(component));
  for (const [index, pattern] of patterns.entries()) files.set(manifest.patterns[index].file, patternMarkdown(pattern));
  await mkdir2(path3.dirname(target), { recursive: true });
  const staging = path3.join(path3.dirname(target), `.design-system-${randomUUID2()}`);
  try {
    for (const [relative, content] of files) {
      const destination = path3.join(staging, relative);
      await mkdir2(path3.dirname(destination), { recursive: true });
      await writeFile2(destination, content, "utf8");
    }
    if (existingEntries.length === 0) await rm2(target, { recursive: true, force: true });
    await rename2(staging, target);
  } catch (error) {
    await rm2(staging, { recursive: true, force: true }).catch(() => void 0);
    throw error;
  }
  const conflicts = [];
  await updateManagedBlock(root, "AGENTS.md", "<!-- opencode-design-system:start -->", "<!-- opencode-design-system:end -->", projectAgentsBlock(manifest.name));
  const supportFiles = [
    [".opencode/skills/design-system/SKILL.md", PORTABLE_SKILL],
    [".opencode/agents/design-system-designer.md", DESIGNER_AGENT],
    [".opencode/agents/screen-designer.md", SCREEN_AGENT],
    [".opencode/commands/design-system.md", `Create or continue the project's Design System. Treat the user as a collaborator: ask only relevant design identity questions, preserve explicit preferences, inspect existing UI read-only when appropriate, then create the framework-neutral files in design-system/. Read AGENTS.md and design-system/AI-GUIDELINES.md. If the OpenCode Design System tools are available, use them to validate and regenerate the preview. Do not edit application UI during analysis. User request: $ARGUMENTS
`],
    [".opencode/commands/design-system/update.md", `Update the existing Design System in response to: $ARGUMENTS. Read its manifest, preferences, relevant tokens and component/pattern documents first. Explain affected parts and ask only if an identity choice is ambiguous. Keep the user's explicit preferences. Apply semantic updates, record the decision, update the version/changelog, run consistency checks, and regenerate the preview from tokens/specifications. If plugin tools are not available, edit the structured Markdown/JSON deliberately and run node design-system/tools/generate-preview.mjs. Do not use blind search/replace and do not modify application components unless explicitly asked.
`],
    [".opencode/commands/design-system/preview.md", `Regenerate design-system/preview/index.html from manifest.json, tokens.json, component documents, and patterns. Treat structured Markdown/JSON as the source of truth. If the Design System plugin is available, use its preview tool; otherwise run node design-system/tools/generate-preview.mjs from the project root.
`],
    [".opencode/commands/design-system/check.md", `Check project UI code against design-system/manifest.json and its semantic tokens. Report unknown values, component/state/layout deviations, and likely inconsistencies with file paths. Do not edit application code. If available, use the Design System check tool.
`],
    [".opencode/commands/design-screen.md", `Design (do not implement) the requested screen using the Design System. Read AGENTS.md and design-system/AI-GUIDELINES.md, then load only the matching manifest entries, tokens, components, and patterns. Write an implementation-ready brief to design-system/screens/<kebab-case-name>.md with purpose, layout, hierarchy, components/token references, content/data, interactions/states, responsive behavior, and accessibility. If the Design System is absent, say so and write a portable brief without claiming system conformance. Request: $ARGUMENTS
`]
  ];
  for (const [relative, content] of supportFiles) {
    if (!await writeIfAbsent(root, relative, content)) conflicts.push(relative);
  }
  return { success: true, manifest, files: [...files.keys()].map((file) => `${DESIGN_SYSTEM_DIR}/${file}`), conflicts };
}
async function regeneratePreview(root) {
  const manifest = await readManifest(root);
  const tokens = await readJson(root, `${DESIGN_SYSTEM_DIR}/${manifest.tokens}`);
  const components = await Promise.all(manifest.components.map(async (item) => parseComponent(item.name, await readText2(root, `${DESIGN_SYSTEM_DIR}/${item.file}`), item.tokens)));
  const patterns = await Promise.all(manifest.patterns.map(async (item) => parsePattern(item.name, await readText2(root, `${DESIGN_SYSTEM_DIR}/${item.file}`), item.tokens)));
  const html = createPreviewHtml({ manifest, tokens, components, patterns });
  await atomicWrite(root, `${DESIGN_SYSTEM_DIR}/${manifest.preview}`, html);
  return { preview: `${DESIGN_SYSTEM_DIR}/${manifest.preview}`, componentCount: components.length, patternCount: patterns.length };
}
async function readManifest(root) {
  return readJson(root, `${DESIGN_SYSTEM_DIR}/manifest.json`);
}
var readText2 = readText;
function validateCreateInput(input) {
  if (!input.name?.trim()) throw new Error("name is required");
  if (!input.description?.trim()) throw new Error("description is required");
  if (!input.foundations?.trim()) throw new Error("foundations must contain the agreed design foundations");
  const tokenErrors = validateTokens(input.tokens);
  if (tokenErrors.length) throw new Error(tokenErrors.join("; "));
  if (input.preferences && input.preferences.some((item) => !item.key || item.value === void 0)) throw new Error("Each preference requires a key and value");
}
function normalizeComponents(input, availableTokens) {
  const isDefault = !input?.length;
  const items = isDefault ? [
    { name: "Button", purpose: "Triggers a clear, immediate action.", variants: ["primary", "secondary", "danger"], sizes: ["small", "medium", "large"], tokens: ["color.accent.primary", "radius.control", "spacing.control"] },
    { name: "Input", purpose: "Collects a single value with a persistent label and clear validation feedback.", variants: ["default", "error", "success"], sizes: ["medium", "large"], tokens: ["color.surface.base", "color.text.primary", "radius.control"] },
    { name: "Card", purpose: "Groups related content and actions into a distinct surface.", variants: ["default", "interactive"], tokens: ["color.surface.raised", "radius.card", "elevation.surface"] }
  ] : input;
  return uniqueNamed(items, "component").map((item) => {
    const tokens = item.tokens ?? [];
    const missing = isDefault ? [] : tokens.filter((token) => !availableTokens.has(token));
    if (missing.length) throw new Error(`${item.name} references unknown token(s): ${missing.join(", ")}`);
    return { ...item, tokens: isDefault ? tokens.filter((token) => availableTokens.has(token)) : tokens };
  });
}
function normalizePatterns(input, availableTokens) {
  const isDefault = !input?.length;
  const items = isDefault ? [{ name: "Form", purpose: "Collect and validate related information with clear progression and recovery.", composition: ["Input", "Button"], tokens: ["spacing.md", "color.status.danger"] }] : input;
  return uniqueNamed(items, "pattern").map((item) => {
    const tokens = item.tokens ?? [];
    const missing = isDefault ? [] : tokens.filter((token) => !availableTokens.has(token));
    if (missing.length) throw new Error(`${item.name} references unknown token(s): ${missing.join(", ")}`);
    return { ...item, tokens: isDefault ? tokens.filter((token) => availableTokens.has(token)) : tokens };
  });
}
function semanticTokenPaths(value, prefix = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return prefix ? [prefix] : [];
  return Object.entries(value).flatMap(([key, item]) => semanticTokenPaths(item, prefix ? `${prefix}.${key}` : key));
}
function uniqueNamed(items, kind) {
  const seen = /* @__PURE__ */ new Set();
  return items.map((item) => {
    if (!item.name?.trim()) throw new Error(`Every ${kind} requires a name`);
    const key = slugify(item.name);
    if (seen.has(key)) throw new Error(`Duplicate ${kind} name: ${item.name}`);
    seen.add(key);
    return { ...item, name: item.name.trim() };
  });
}
function initialDecisions(preferences) {
  const lines = preferences.length ? preferences.map((item) => `- **${item.key}:** ${JSON.stringify(item.value)}${item.rationale ? ` \u2014 ${item.rationale}` : ""}`).join("\n") : "- No explicit preferences recorded yet. Add decisions as the system is reviewed.";
  return `# Design decisions

These decisions preserve user intent across future design and implementation work.

## Initial direction

${lines}
`;
}
function systemReadme(manifest) {
  return `# ${manifest.name}

${manifest.description}

- **Status:** ${manifest.status}
- **Design System version:** ${manifest.designSystemVersion}
- **Schema version:** ${manifest.schemaVersion}
- **Source:** ${manifest.source.type}

## Source of truth

Start with [manifest.json](manifest.json), which indexes the [semantic tokens](tokens.json), [foundations](FOUNDATIONS.md), [AI guidelines](AI-GUIDELINES.md), [preferences](preferences.json), [decisions](DECISIONS.md), component and pattern documentation, and the generated [interactive preview](preview/index.html).

The definition is framework-neutral. The HTML is a generated view, not an independent design specification. Update structured files and regenerate the preview.

## Progressive loading

Read the manifest and AI guidelines first. Load only task-relevant component and pattern files and the token branches they reference. Screen design briefs go in [screens/](screens/).

## Plugin-independent maintenance

This project includes [tools/generate-preview.mjs](tools/generate-preview.mjs), a dependency-free Node.js renderer. After editing structured tokens/specifications without the plugin, run node design-system/tools/generate-preview.mjs from the project root. The project [AGENTS.md](../AGENTS.md) and local OpenCode Skill/agents/commands preserve usage guidance when the plugin is not installed.
`;
}
function pretty(value) {
  return `${JSON.stringify(value, null, 2)}
`;
}
function parseComponent(name, markdown, tokens) {
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
    related: bullets(section(markdown, "Related components"))
  };
}
function parsePattern(name, markdown, tokens) {
  return {
    name,
    purpose: section(markdown, "Purpose") || `Documented ${name} pattern.`,
    composition: bullets(section(markdown, "Composition")),
    behavior: section(markdown, "Behavior"),
    responsive: section(markdown, "Responsive"),
    accessibility: section(markdown, "Accessibility"),
    guidance: section(markdown, "Guidance"),
    tokens: tokens.length ? tokens : bullets(section(markdown, "Tokens")).map((value) => value.replaceAll("`", ""))
  };
}
function section(markdown, heading) {
  const match = markdown.match(new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, "mi"));
  return match?.[1]?.replace(/^- None specified\.$/m, "").trim() ?? "";
}
function bullets(value) {
  return value.split("\n").map((line) => line.match(/^\s*-\s+(.*)$/)?.[1]?.trim()).filter((item) => Boolean(item) && item !== "None specified." && item !== "No direct token references declared.");
}

// src/project-analysis.ts
import { readdir as readdir2, readFile as readFile3 } from "fs/promises";
import path4 from "path";
var OMIT_DIRS = /* @__PURE__ */ new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "target",
  "out",
  "design-system",
  ".opencode",
  ".turbo",
  ".cache",
  "storybook-static"
]);
var UI_EXTENSIONS = /* @__PURE__ */ new Set([".css", ".scss", ".sass", ".less", ".html", ".tsx", ".jsx", ".vue", ".svelte", ".astro"]);
var STYLE_EXTENSIONS = /* @__PURE__ */ new Set([".css", ".scss", ".sass", ".less"]);
var ASSET_EXTENSIONS = /* @__PURE__ */ new Set([".svg", ".woff", ".woff2", ".ttf", ".otf"]);
var MAX_FILES = 160;
var MAX_FILE_BYTES = 48e3;
var MAX_TOTAL_BYTES = 75e4;
async function analyzeProject(root) {
  const files = [];
  let truncated = false;
  const assetCandidates = [];
  async function walk(directory, depth) {
    if (depth > 7 || files.length >= MAX_FILES) {
      truncated = true;
      return;
    }
    let entries;
    try {
      entries = await readdir2(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolute = path4.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && !OMIT_DIRS.has(entry.name)) await walk(absolute, depth + 1);
      } else if (entry.isFile()) {
        const extension = path4.extname(entry.name).toLowerCase();
        const relative = path4.relative(root, absolute).split(path4.sep).join("/");
        if (ASSET_EXTENSIONS.has(extension)) {
          if (assetCandidates.length < 80) assetCandidates.push(relative);
          continue;
        }
        if (!UI_EXTENSIONS.has(extension) && !isFrameworkStyleConfig(entry.name)) continue;
        files.push(relative);
        if (files.length >= MAX_FILES) {
          truncated = true;
          return;
        }
      }
    }
  }
  await walk(root, 0);
  let totalBytes = 0;
  const contentByFile = /* @__PURE__ */ new Map();
  for (const relative of files) {
    try {
      const content = await readFile3(path4.join(root, relative), "utf8");
      const bytes = Buffer.byteLength(content);
      if (bytes > MAX_FILE_BYTES || totalBytes + bytes > MAX_TOTAL_BYTES) {
        truncated = true;
        continue;
      }
      totalBytes += bytes;
      contentByFile.set(relative, content);
    } catch {
    }
  }
  const colorStats = /* @__PURE__ */ new Map();
  const radiusStats = /* @__PURE__ */ new Map();
  const spacingStats = /* @__PURE__ */ new Map();
  const styleSources = [];
  const componentCandidates = /* @__PURE__ */ new Set();
  for (const [file, content] of contentByFile) {
    const ext = path4.extname(file).toLowerCase();
    const inStyle = STYLE_EXTENSIONS.has(ext) || isFrameworkStyleConfig(path4.basename(file));
    if (inStyle || /\.(?:tsx|jsx|vue|svelte|astro)$/.test(ext)) {
      const variables = [];
      for (const match of content.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)\s*;/g)) {
        variables.push({ name: match[1], value: compact(match[2]) });
      }
      const colors = uniqueMatches(content, /#[\da-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\([^)]{1,80}\)/gi);
      const radii2 = uniqueMatches(content, /(?:border-radius|borderRadius|radius)\s*[:=]\s*["']?([^;'"{}]+)/gi, 1).map(compact);
      const breakpoints = uniqueMatches(content, /@media\s*\([^)]*(?:min-width|max-width)\s*:\s*([^;)]+)/gi, 1).map(compact);
      styleSources.push({ file, variables: variables.slice(0, 50), colors: colors.slice(0, 35), radii: radii2.slice(0, 25), breakpoints: breakpoints.slice(0, 20) });
      for (const color of colors) addOccurrence(colorStats, color.toLowerCase(), file);
      for (const radius of radii2) addOccurrence(radiusStats, radius.toLowerCase(), file);
      for (const match of content.matchAll(/(?:padding|margin|gap|grid-gap|gridGap|spacing)(?:-[\w]+)?\s*[:=]\s*["']?([^;'"{}]+)/gi)) {
        for (const value of match[1].matchAll(/\b\d+(?:\.\d+)?(?:px|rem|em)\b/gi)) {
          spacingStats.set(value[0].toLowerCase(), (spacingStats.get(value[0].toLowerCase()) ?? 0) + 1);
        }
      }
    }
    if (/\.(?:tsx|jsx|vue|svelte|astro)$/i.test(file)) {
      for (const match of content.matchAll(/(?:export\s+)?(?:function|class|const)\s+([A-Z][A-Za-z0-9]{1,50})\b/g)) {
        componentCandidates.add(match[1]);
      }
    }
  }
  const dependencies = await readDependencies(root);
  const frameworks = dependencies.filter((name) => ["react", "react-dom", "vue", "svelte", "@angular/core", "solid-js", "next", "nuxt", "astro"].includes(name));
  const uiLibraries = dependencies.filter((name) => /(?:mui|material|chakra|radix|shadcn|antd|ant-design|mantine|headlessui|fluent|carbon|prime|vuetify|naive-ui|bootstrap|tailwind)/i.test(name));
  const iconPackages = dependencies.filter((name) => /(?:icon|icons|lucide|heroicons|phosphor|fontawesome|react-icons)/i.test(name));
  const radii = summarize(radiusStats);
  const probableInconsistencies = [];
  const pixelRadii = radii.flatMap((item) => {
    const match = item.value.match(/^([\d.]+)px$/);
    return match ? [{ value: item.value, pixels: Number(match[1]), occurrences: item.occurrences }] : [];
  });
  if (pixelRadii.length >= 2) {
    const close = pixelRadii.filter((item) => pixelRadii.some((candidate) => candidate.value !== item.value && Math.abs(candidate.pixels - item.pixels) <= 4));
    if (close.length >= 2) probableInconsistencies.push(`Border radii are close but distinct (${[...new Set(close.map((item) => item.value))].join(", ")}). They may be accidental drift; confirm before normalizing.`);
  }
  if (![...contentByFile.keys()].some((file) => STYLE_EXTENSIONS.has(path4.extname(file).toLowerCase()) || isFrameworkStyleConfig(path4.basename(file)))) {
    probableInconsistencies.push("No stylesheet or recognized style configuration was found in the bounded scan; visual values may be defined by utility classes, runtime styles, or a dependency.");
  }
  const repeatedColors = summarize(colorStats);
  if (repeatedColors.length > 14) probableInconsistencies.push(`The UI uses ${repeatedColors.length} distinct color literals. Determine which are semantic roles and which are one-off values before proposing consolidation.`);
  const notes = [
    "Read-only analysis: no application files were changed.",
    "Evidence is an inference from source, not proof that each observed variation is intentional.",
    ...truncated ? [`Scan bounded at ${MAX_FILES} candidate files and/or ${Math.round(MAX_TOTAL_BYTES / 1e3)} KB of file contents; results may be incomplete.`] : []
  ];
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
    notes
  };
}
async function checkProject(root) {
  const analysis = await analyzeProject(root);
  const warnings = [];
  const findings = [...analysis.probableInconsistencies];
  let manifest;
  let tokens;
  try {
    manifest = await readJson(root, "design-system/manifest.json");
    tokens = await readJson(root, `design-system/${manifest.tokens}`);
  } catch {
    return { checkedFiles: analysis.scannedFiles.length, warnings: ["No readable design-system/manifest.json and token file were found."], findings };
  }
  const tokenValues = flattenTokenValues(tokens);
  const knownColors = new Set(tokenValues.filter((item) => item.path.toLowerCase().includes("color")).map((item) => normalizeValue(item.value)));
  const knownRadii = new Set(tokenValues.filter((item) => item.path.toLowerCase().includes("radius")).map((item) => normalizeValue(item.value)));
  for (const style of analysis.styleSources) {
    const content = await readReadOnlyFile(root, style.file);
    if (!content) continue;
    for (const color of style.colors) {
      const normalized = normalizeValue(color);
      if (!knownColors.has(normalized)) warnings.push(`${style.file}: color literal ${color} is not an exact token value; verify whether a semantic token should be used.`);
    }
    for (const radius of style.radii) {
      const concrete = radius.match(/^([\d.]+(?:px|rem|em))$/i)?.[1];
      if (concrete && !knownRadii.has(normalizeValue(concrete))) warnings.push(`${style.file}: border-radius ${concrete} is not an exact token value.`);
    }
    if (/(?:button|\.btn)[^{]{0,60}\{[^}]{0,800}(?:min-height|height)\s*:\s*([\d.]+px)/i.test(content)) {
      const height = content.match(/(?:button|\.btn)[^{]{0,60}\{[^}]{0,800}(?:min-height|height)\s*:\s*([\d.]+px)/i)?.[1];
      if (height && !tokenValues.some((item) => /size|height|control/i.test(item.path) && normalizeValue(item.value) === normalizeValue(height))) {
        warnings.push(`${style.file}: button height ${height} has no matching documented size token.`);
      }
    }
  }
  return { checkedFiles: analysis.scannedFiles.length, warnings: unique(warnings).slice(0, 80), findings };
}
function uniqueMatches(content, expression, group = 0) {
  return [...new Set([...content.matchAll(expression)].map((match) => compact(match[group])))];
}
function addOccurrence(stats, value, file) {
  const files = stats.get(value) ?? /* @__PURE__ */ new Set();
  files.add(file);
  stats.set(value, files);
}
function summarize(stats) {
  return [...stats].map(([value, files]) => ({ value, occurrences: files.size, files: [...files].slice(0, 8) })).sort((a, b) => b.occurrences - a.occurrences || a.value.localeCompare(b.value));
}
function compact(value) {
  return value.replace(/\s+/g, " ").trim().slice(0, 140);
}
async function readDependencies(root) {
  try {
    const pkg = JSON.parse(await readFile3(path4.join(root, "package.json"), "utf8"));
    const dependencies = [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies].filter((value) => value && typeof value === "object");
    return [...new Set(dependencies.flatMap((item) => Object.keys(item)))];
  } catch {
    return [];
  }
}
async function readReadOnlyFile(root, relative) {
  try {
    return await readFile3(path4.join(root, relative), "utf8");
  } catch {
    return void 0;
  }
}
function flattenTokenValues(value, prefix = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return typeof value === "string" || typeof value === "number" ? [{ path: prefix, value: String(value) }] : [];
  return Object.entries(value).flatMap(([key, item]) => flattenTokenValues(item, prefix ? `${prefix}.${key}` : key));
}
function normalizeValue(value) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
function unique(values) {
  return [...new Set(values)];
}
function isFrameworkStyleConfig(filename) {
  return /^(?:tailwind|postcss|vite|next|nuxt|svelte|astro)\.config\.(?:[cm]?js|[cm]?ts)$/i.test(filename);
}

// src/screen.ts
async function saveScreenSpec(root, name, specification) {
  if (!name.trim()) throw new Error("screen name is required");
  if (!specification.trim()) throw new Error("screen specification is required");
  if (specification.length > 6e4) throw new Error("screen specification exceeds 60 KB");
  const file = `${DESIGN_SYSTEM_DIR}/screens/${slugify(name)}.md`;
  const updated = await fileExists(root, file);
  await atomicWrite(root, file, `# ${name.trim()}

${specification.trim()}
`);
  return { file, updated, hasDesignSystem: await fileExists(root, `${DESIGN_SYSTEM_DIR}/manifest.json`) };
}

// src/update.ts
async function updateDesignSystem(root, input) {
  if (!input.request.trim()) throw new Error("request is required");
  if (!input.decision.trim()) throw new Error("decision is required to preserve the rationale");
  if (!input.tokenUpdates.length && !input.tokenAdds?.length && !input.componentUpdates?.length && !input.patternUpdates?.length && !input.newComponents?.length && !input.newPatterns?.length && !input.foundationUpdate && !input.preferenceUpdates?.length && !input.status) {
    throw new Error("The update has no token, foundation, or preference change to apply");
  }
  const manifest = await readManifest(root);
  const previousVersion = manifest.designSystemVersion;
  const tokens = await readJson(root, `${DESIGN_SYSTEM_DIR}/${manifest.tokens}`);
  const preferencesDocument = await readJson(root, `${DESIGN_SYSTEM_DIR}/${manifest.preferences}`);
  const preferences = mergePreferences(preferencesDocument.preferences ?? [], input.preferenceUpdates ?? []);
  const updatedTokens = [];
  const addedTokens = [];
  for (const token of input.tokenUpdates) {
    const parts = parseTokenPath(token.path);
    setSemanticToken(tokens, parts, token.value);
    updatedTokens.push(parts.join("."));
  }
  for (const token of input.tokenAdds ?? []) {
    const parts = parseTokenPath(token.path);
    if (parts[0] === "themes") throw new Error("New semantic tokens must be added to every theme; use an unprefixed semantic path");
    addSemanticToken(tokens, parts, token.values);
    updatedTokens.push(parts.join("."));
    addedTokens.push(parts.join("."));
  }
  const tokenErrors = validateTokens(tokens);
  if (tokenErrors.length) throw new Error(tokenErrors.join("; "));
  const componentAdditions = await prepareComponentAdditions(root, manifest, tokens, input.newComponents ?? []);
  const patternAdditions = await preparePatternAdditions(root, manifest, tokens, input.newPatterns ?? []);
  manifest.components.push(...componentAdditions.map((item) => ({ name: item.name, file: item.file, tokens: item.definition.tokens ?? [] })));
  manifest.patterns.push(...patternAdditions.map((item) => ({ name: item.name, file: item.file, tokens: item.definition.tokens ?? [] })));
  const documentUpdates = await validateDocumentUpdates(manifest, input);
  const updatedNames = new Set(documentUpdates.map((item) => `${item.kind}:${item.name.toLowerCase()}`));
  for (const item of componentAdditions) if (updatedNames.has(`component:${item.name.toLowerCase()}`)) throw new Error(`Use either newComponents or componentUpdates for ${item.name}, not both`);
  for (const item of patternAdditions) if (updatedNames.has(`pattern:${item.name.toLowerCase()}`)) throw new Error(`Use either newPatterns or patternUpdates for ${item.name}, not both`);
  const addedDocuments = [
    ...componentAdditions.map((item) => ({ kind: "component", name: item.name, file: item.file, content: componentMarkdown(item.definition) })),
    ...patternAdditions.map((item) => ({ kind: "pattern", name: item.name, file: item.file, content: patternMarkdown(item.definition) }))
  ];
  const updatedDocuments = [...documentUpdates, ...addedDocuments];
  for (const document of updatedDocuments) {
    if (document.kind === "component") {
      const entry = manifest.components.find((item) => item.name === document.name);
      const updatedTokenReferences = extractTokenReferences(document.content);
      if (updatedTokenReferences.length) entry.tokens = updatedTokenReferences;
    } else {
      const entry = manifest.patterns.find((item) => item.name === document.name);
      const updatedTokenReferences = extractTokenReferences(document.content);
      if (updatedTokenReferences.length) entry.tokens = updatedTokenReferences;
    }
  }
  const dependency = await findTokenDependents(root, manifest, updatedTokens.map((item) => item.replace(/^themes\.[^.]+\./, "")), updatedDocuments);
  const warnings = await tokenReferenceWarnings(root, manifest, tokens, updatedDocuments);
  const now = /* @__PURE__ */ new Date();
  const impact = componentAdditions.length || patternAdditions.length || addedTokens.length ? input.impact === "major" ? "major" : "minor" : input.impact;
  const version = bumpVersion(previousVersion, impact);
  const date = now.toISOString().slice(0, 10);
  manifest.designSystemVersion = version;
  manifest.updatedAt = now.toISOString();
  manifest.status = input.status ?? "draft";
  manifest.themes = Object.keys(tokens.themes);
  const changelogEntry = `## ${version} \u2014 ${date} (${impact.toUpperCase()})

- ${input.request.trim()}
- Decision: ${input.decision.trim()}
- Updated tokens: ${updatedTokens.length ? updatedTokens.map((item) => `\`${item}\``).join(", ") : "none"}.
- Added components: ${componentAdditions.map((item) => item.name).join(", ") || "none"}.
- Added patterns: ${patternAdditions.map((item) => item.name).join(", ") || "none"}.
- Affected components: ${dependency.components.length ? dependency.components.join(", ") : "none detected"}.
- Affected patterns: ${dependency.patterns.length ? dependency.patterns.join(", ") : "none detected"}.
`;
  const [changelog, decisions, foundations] = await Promise.all([
    readText(root, `${DESIGN_SYSTEM_DIR}/${manifest.changelog}`),
    readText(root, `${DESIGN_SYSTEM_DIR}/${manifest.decisions}`),
    readText(root, `${DESIGN_SYSTEM_DIR}/${manifest.foundations}`)
  ]);
  const decisionEntry = `
## ${date} \u2014 ${input.request.trim()}

${input.decision.trim()}

- Version: ${version} (${impact.toUpperCase()})
${updatedTokens.map((item) => `- Token: \`${item}\``).join("\n")}
`;
  await atomicWrite(root, `${DESIGN_SYSTEM_DIR}/${manifest.tokens}`, `${JSON.stringify({ ...tokens, $schema: "./schema/tokens.schema.json" }, null, 2)}
`);
  await atomicWrite(root, `${DESIGN_SYSTEM_DIR}/${manifest.preferences}`, `${JSON.stringify({ schemaVersion: preferencesDocument.schemaVersion ?? manifest.schemaVersion, preferences }, null, 2)}
`);
  for (const document of updatedDocuments) {
    const entry = document.kind === "component" ? manifest.components.find((item) => item.name === document.name) : manifest.patterns.find((item) => item.name === document.name);
    await atomicWrite(root, `${DESIGN_SYSTEM_DIR}/${entry.file}`, document.content.endsWith("\n") ? document.content : `${document.content}
`);
  }
  if (input.foundationUpdate?.trim()) {
    await atomicWrite(root, `${DESIGN_SYSTEM_DIR}/${manifest.foundations}`, `${foundations.trimEnd()}

## Iteration \u2014 ${date}

${input.foundationUpdate.trim()}
`);
  }
  await atomicWrite(root, `${DESIGN_SYSTEM_DIR}/${manifest.decisions}`, `${decisions.trimEnd()}
${decisionEntry}`);
  await atomicWrite(root, `${DESIGN_SYSTEM_DIR}/${manifest.changelog}`, `# Changelog

${changelogEntry}
${changelog.replace(/^# Changelog\s*/i, "").trim()}
`);
  await atomicWrite(root, `${DESIGN_SYSTEM_DIR}/${manifest.guidelines}`, aiGuidelines(manifest.name, preferences));
  await atomicWrite(root, `${DESIGN_SYSTEM_DIR}/manifest.json`, `${JSON.stringify({ $schema: "./schema/manifest.schema.json", ...manifest }, null, 2)}
`);
  const readme = await readText(root, `${DESIGN_SYSTEM_DIR}/README.md`);
  const updatedReadme = readme.replace(/^- \*\*Status:\*\* .*$/m, `- **Status:** ${manifest.status}`).replace(/^- \*\*Design System version:\*\* .*$/m, `- **Design System version:** ${version}`);
  await atomicWrite(root, `${DESIGN_SYSTEM_DIR}/README.md`, updatedReadme);
  const preview = await regeneratePreview(root);
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
    regenerated: [`${DESIGN_SYSTEM_DIR}/${manifest.tokens}`, `${DESIGN_SYSTEM_DIR}/${manifest.preferences}`, `${DESIGN_SYSTEM_DIR}/${manifest.guidelines}`, `${DESIGN_SYSTEM_DIR}/${manifest.decisions}`, `${DESIGN_SYSTEM_DIR}/${manifest.changelog}`, `${DESIGN_SYSTEM_DIR}/${manifest.preview}`, ...input.foundationUpdate?.trim() ? [`${DESIGN_SYSTEM_DIR}/${manifest.foundations}`] : []]
  };
}
async function validateDocumentUpdates(manifest, input) {
  const updates = [];
  for (const [kind, documents, records] of [
    ["component", input.componentUpdates ?? [], manifest.components],
    ["pattern", input.patternUpdates ?? [], manifest.patterns]
  ]) {
    const seen = /* @__PURE__ */ new Set();
    for (const document of documents) {
      if (!document.name?.trim() || !document.content?.trim()) throw new Error(`Each ${kind} update requires a name and Markdown content`);
      if (document.content.length > 4e4) throw new Error(`${kind} document ${document.name} exceeds 40 KB`);
      const record = records.find((item) => item.name.toLowerCase() === document.name.toLowerCase());
      if (!record) throw new Error(`Unknown ${kind} document: ${document.name}`);
      if (seen.has(record.name)) throw new Error(`Duplicate ${kind} update: ${record.name}`);
      seen.add(record.name);
      updates.push({ kind, name: record.name, file: record.file, content: document.content.trim() });
    }
  }
  return updates;
}
async function prepareComponentAdditions(root, manifest, tokens, definitions) {
  return prepareAdditions(root, manifest.components, "components", tokens, definitions);
}
async function preparePatternAdditions(root, manifest, tokens, definitions) {
  return prepareAdditions(root, manifest.patterns, "patterns", tokens, definitions);
}
async function prepareAdditions(root, existing, folder, tokenDocument, definitions) {
  const themes = tokenDocument.themes;
  const knownTokens = new Set(Object.values(themes ?? {}).flatMap((theme) => flattenPaths(theme)));
  const names = new Set(existing.map((item) => slugify(item.name)));
  const additions = [];
  for (const source of definitions) {
    const name = source.name?.trim();
    if (!name || !source.purpose?.trim()) throw new Error(`Each new ${folder.slice(0, -1)} requires a name and purpose`);
    const slug = slugify(name);
    if (names.has(slug)) throw new Error(`A ${folder.slice(0, -1)} with this name already exists: ${name}`);
    names.add(slug);
    const missing = (source.tokens ?? []).filter((token) => !knownTokens.has(token));
    if (missing.length) throw new Error(`${name} references unknown token(s): ${missing.join(", ")}`);
    const file = `${folder}/${slug}.md`;
    if (await fileExists(root, `${DESIGN_SYSTEM_DIR}/${file}`)) throw new Error(`Refusing to overwrite an existing file while adding ${name}: ${file}`);
    additions.push({ name, file, definition: { ...source, name } });
  }
  return additions;
}
function extractTokenReferences(markdown) {
  const section2 = markdown.match(/^## Tokens\s*\n([\s\S]*?)(?=\n## |$)/mi)?.[1];
  if (!section2) return [];
  return [...section2.matchAll(/^\s*-\s+`([a-zA-Z][\w-]*(?:\.[a-zA-Z][\w-]*)+)`\s*$/gm)].map((item) => item[1]);
}
async function findTokenDependents(root, manifest, paths, documentOverrides = []) {
  const check = async (entries) => {
    const result = [];
    for (const entry of entries) {
      const content = documentOverrides.find((item) => item.file === entry.file)?.content ?? await readText(root, `${DESIGN_SYSTEM_DIR}/${entry.file}`);
      const declared = /* @__PURE__ */ new Set([...entry.tokens, ...pathsFromMarkdown(content)]);
      if (paths.some((token) => declared.has(token))) result.push(entry.name);
    }
    return result;
  };
  return { components: await check(manifest.components), patterns: await check(manifest.patterns) };
}
function parseTokenPath(value) {
  const parts = value.split(".");
  if (parts.length < 2 || parts.some((part) => !/^[a-zA-Z][\w-]*$/.test(part) || ["__proto__", "prototype", "constructor"].includes(part))) {
    throw new Error(`Invalid semantic token path: ${value}`);
  }
  return parts;
}
function setSemanticToken(root, parts, value) {
  if (parts[0] === "themes") {
    setExistingPath(root, parts, value);
    return;
  }
  const themes = root.themes;
  if (!themes || typeof themes !== "object" || Array.isArray(themes)) throw new Error("tokens.themes is missing");
  const updated = [];
  for (const [themeName, theme] of Object.entries(themes)) {
    if (!theme || typeof theme !== "object" || Array.isArray(theme)) continue;
    try {
      setExistingPath(theme, parts, value);
      updated.push(themeName);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("Token path does not exist:")) throw error;
    }
  }
  if (!updated.length) throw new Error(`Token path does not exist in any theme: ${parts.join(".")}`);
}
function setExistingPath(root, parts, value) {
  let current = root;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (!next || typeof next !== "object" || Array.isArray(next)) throw new Error(`Token path does not exist: ${parts.join(".")}`);
    current = next;
  }
  const key = parts.at(-1);
  if (!(key in current)) throw new Error(`Token path does not exist: ${parts.join(".")}; add new tokens through a reviewed system expansion`);
  current[key] = value;
}
function addSemanticToken(document, parts, values) {
  const themes = document.themes;
  if (!themes || typeof themes !== "object" || Array.isArray(themes)) throw new Error("tokens.themes is missing");
  const themeNames = Object.keys(themes);
  const suppliedThemes = Object.keys(values ?? {});
  const missingThemes = themeNames.filter((name) => !Object.hasOwn(values ?? {}, name));
  const unknownThemes = suppliedThemes.filter((name) => !themeNames.includes(name));
  if (missingThemes.length || unknownThemes.length) throw new Error(`New token ${parts.join(".")} requires one value for each theme. Missing: ${missingThemes.join(", ") || "none"}; unknown: ${unknownThemes.join(", ") || "none"}.`);
  for (const themeName of themeNames) {
    const theme = themes[themeName];
    const value = values[themeName];
    if (!theme || typeof theme !== "object" || Array.isArray(theme)) throw new Error(`tokens.themes.${themeName} must be an object`);
    if (!["string", "number", "boolean"].includes(typeof value)) throw new Error(`Token value for theme ${themeName} must be a string, number, or boolean`);
    setNewPath(theme, parts, value);
  }
}
function setNewPath(root, parts, value) {
  let current = root;
  for (const part of parts.slice(0, -1)) {
    const existing = current[part];
    if (existing === void 0) current[part] = {};
    else if (!existing || typeof existing !== "object" || Array.isArray(existing)) throw new Error(`Token path conflicts with an existing value: ${parts.join(".")}`);
    current = current[part];
  }
  const leaf = parts.at(-1);
  if (Object.hasOwn(current, leaf)) throw new Error(`Token path already exists: ${parts.join(".")}`);
  current[leaf] = value;
}
function mergePreferences(current, updates) {
  const result = new Map(current.map((item) => [item.key, item]));
  for (const item of updates) {
    if (!item.key || item.value === void 0) throw new Error("Each preference update requires a key and value");
    result.set(item.key, { ...result.get(item.key), ...item });
  }
  return [...result.values()];
}
function pathsFromMarkdown(content) {
  return [...content.matchAll(/`([a-zA-Z][\w-]*(?:\.[a-zA-Z][\w-]*)+)`/g)].map((item) => item[1]);
}
async function tokenReferenceWarnings(root, manifest, tokens, documentOverrides = []) {
  const themes = tokens.themes;
  const known = new Set(Object.values(themes ?? {}).flatMap((theme) => flattenPaths(theme)));
  const missing = /* @__PURE__ */ new Set();
  for (const entry of [...manifest.components, ...manifest.patterns]) {
    const content = documentOverrides.find((item) => item.file === entry.file)?.content ?? await readText(root, `${DESIGN_SYSTEM_DIR}/${entry.file}`);
    for (const token of [...entry.tokens, ...pathsFromMarkdown(content)]) if (!known.has(token)) missing.add(`${entry.name}: ${token}`);
  }
  return [...missing].map((item) => `Unresolved token reference ${item}`);
}
function flattenPaths(value, prefix = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return prefix ? [prefix] : [];
  return Object.entries(value).flatMap(([key, item]) => flattenPaths(item, prefix ? `${prefix}.${key}` : key));
}
function bumpVersion(version, impact) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`Invalid designSystemVersion: ${version}`);
  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);
  if (impact === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (impact === "minor") {
    minor += 1;
    patch = 0;
  } else patch += 1;
  return `${major}.${minor}.${patch}`;
}

// src/index.ts
var commandPrompts = [
  {
    name: "design-system",
    description: "Create a Design System collaboratively, from scratch or from an existing UI",
    instruction: `Act as the project's design-system-designer. Collaborate naturally and gather only the identity decisions that are genuinely unclear. Explicit preferences always win. If a Design System already exists, read it and offer an update/continue path rather than overwriting it. If the repository has UI and the user has not said whether to formalize that UI or start fresh, call the read-only analysis tool and ask them which path they prefer; do not assume. Distinguish evidence from inference and ask about important inconsistencies before normalization. For a new system, confirm a concise visual direction before writing files; then call design_system_create with neutral tokens, foundations, explicit preferences, a few useful components and patterns, and any source evidence. Keep status draft until reviewed. Do not modify application files.

User request:`
  },
  {
    name: "design-system/update",
    description: "Make a coherent, versioned change to the existing Design System",
    instruction: `Read the Design System first using design_system_read. When the design-system-designer subagent is available, delegate the design decision to it; otherwise adopt its collaborative role. Interpret the user's request semantically, identify impacted token paths and dependent components/patterns, and honor recorded decisions. If the request conflicts with an explicit preference, ask before changing that preference. For a clear requested change, apply it with design_system_update, explain the dependency impact, provide revised full componentUpdates/patternUpdates where documented behavior or guidance needs a semantic change, add tokens only when existing semantic paths do not fit and then provide a value for every theme, add reusable components/patterns when composition is insufficient, update preferences/decisions/foundations where appropriate, choose patch/minor/major impact (expansion requires at least minor), and report any unresolved references. Do not use blind text replacement and do not modify app UI code.

User request:`
  },
  {
    name: "design-system/preview",
    description: "Generate or refresh the interactive Design System preview",
    instruction: `Call design_system_preview to regenerate the interactive preview from the structured manifest, tokens, foundations, components, and patterns. Summarize the output file and whether light/dark themes and interactive examples are present. Do not treat the HTML as source of truth.

User request:`
  },
  {
    name: "design-system/check",
    description: "Check UI styles for values that drift from the Design System",
    instruction: `Call design_system_check. Report findings with file paths and explain which are exact deviations versus heuristic candidates. The check is read-only and bounded; do not automatically fix application files. Suggest a semantic token or component where possible.

User request:`
  },
  {
    name: "design-screen",
    description: "Design a screen specification using relevant Design System documentation",
    instruction: `Use the screen-designer subagent when available; otherwise adopt its system prompt. First call design_system_read with the user's task to load only the relevant tokens, components, patterns, preferences, and system guidelines. Design and document hierarchy, content, layout, states, interactions, responsive behavior, and accessibility. Keep design separate from implementation. Call design_system_screen_spec to save an implementation-ready Markdown specification under design-system/screens/. Do not write UI code unless asked separately.

User request:`
  }
];
var index_default = Plugin.define({
  id: "opencode-design-system",
  async setup(ctx) {
    const projectRoot = path5.resolve(ctx.location.project.canonical || ctx.location.directory);
    const designSystemPath = path5.join(projectRoot, DESIGN_SYSTEM_DIR, "manifest.json");
    const skillPath = path5.join(projectRoot, ".opencode", "skills", "design-system", "SKILL.md");
    await ctx.skill.transform((editor) => {
      editor.add({
        id: "design-system",
        name: "Design System",
        description: "Apply this project's semantic design tokens, documented components, patterns, preferences, and accessibility guidance to UI work with progressive loading.",
        path: skillPath,
        content: skillBody(),
        autoinvoke: true
      });
    });
    await ctx.session.hook("context", (event) => {
      if (!existsSync(designSystemPath)) return;
      event.system.push({
        type: "text",
        text: "This project has a portable design-system/manifest.json. For UI tasks, load the design-system skill and read only the relevant token/component/pattern files. Honor AI-GUIDELINES.md, preferences.json, and DECISIONS.md. The HTML preview is generated output, not the source of truth."
      });
    });
    await ctx.command.transform((editor) => {
      for (const command of commandPrompts) {
        editor.add({
          name: command.name,
          description: command.description,
          execute: async ({ sessionID, prompt, delivery }) => {
            const suffix = prompt.text?.trim() ? `

${prompt.text.trim()}` : "";
            await ctx.session.prompt({
              ...prompt,
              sessionID,
              text: `${command.instruction}${suffix}`,
              delivery
            });
          }
        });
      }
    });
    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "design_system",
        description: "Create, inspect, update, validate, preview, and write screen specifications for the portable project Design System."
      });
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
            status: { type: "string", enum: ["draft", "review", "stable"] }
          },
          required: ["name", "description", "tokens", "foundations"],
          additionalProperties: false
        },
        execute: async (raw) => {
          const result = await createDesignSystem(projectRoot, raw);
          await ctx.skill.reload();
          return { content: JSON.stringify(result, null, 2) };
        }
      });
      editor.add({
        name: "read",
        description: "Read the manifest and only those Design System tokens, foundation sections, components, and patterns relevant to a UI task. This is the preferred progressive-loading entry point.",
        options: { namespace: "design_system", codemode: true },
        input: {
          type: "object",
          properties: { task: { type: "string", description: "The screen, component, or UI change being designed/implemented." } },
          required: ["task"],
          additionalProperties: false
        },
        execute: async (raw) => ({ content: JSON.stringify(await readRelevantSystem(projectRoot, String(raw.task)), null, 2) })
      });
      editor.add({
        name: "analyze",
        description: "Read-only bounded analysis of an existing app's UI/style sources, frameworks, tokens, component candidates, and likely inconsistencies. It never edits app files.",
        options: { namespace: "design_system", codemode: true },
        input: { type: "object", properties: {}, additionalProperties: false },
        execute: async () => ({ content: JSON.stringify(summarizeAnalysis(await analyzeProject(projectRoot)), null, 2) })
      });
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
            status: { type: "string", enum: ["draft", "review", "stable"] }
          },
          required: ["request", "tokenUpdates", "decision", "impact"],
          additionalProperties: false
        },
        execute: async (raw) => ({ content: JSON.stringify(await updateDesignSystem(projectRoot, raw), null, 2) })
      });
      editor.add({
        name: "preview",
        description: "Regenerate the self-contained interactive HTML preview from the current structured Design System files.",
        options: { namespace: "design_system", codemode: true },
        input: { type: "object", properties: {}, additionalProperties: false },
        execute: async () => ({ content: JSON.stringify(await regeneratePreview(projectRoot), null, 2) })
      });
      editor.add({
        name: "check",
        description: "Read-only heuristic check for UI color literals, border radii, button heights, and inconsistencies not represented by existing Design System tokens.",
        options: { namespace: "design_system", codemode: true },
        input: { type: "object", properties: {}, additionalProperties: false },
        execute: async () => ({ content: JSON.stringify(await checkProject(projectRoot), null, 2) })
      });
      editor.add({
        name: "screen_spec",
        description: "Save an implementation-ready, framework-neutral screen design brief to design-system/screens/<name>.md without modifying application code.",
        options: { namespace: "design_system", codemode: true },
        input: {
          type: "object",
          properties: {
            name: { type: "string" },
            specification: { type: "string", description: "Purpose, layout, hierarchy, components/tokens, data, states, interactions, responsive behavior, and accessibility." }
          },
          required: ["name", "specification"],
          additionalProperties: false
        },
        execute: async (raw) => ({ content: JSON.stringify(await saveScreenSpec(projectRoot, String(raw.name), String(raw.specification)), null, 2) })
      });
    });
    return () => void 0;
  }
});
var preferenceSchema = {
  type: "object",
  properties: {
    key: { type: "string" },
    value: { type: ["string", "number", "boolean"] },
    explicit: { type: "boolean" },
    rationale: { type: "string" }
  },
  required: ["key", "value"],
  additionalProperties: false
};
var componentSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    purpose: { type: "string" },
    variants: stringArray(),
    sizes: stringArray(),
    tokens: stringArray(),
    states: stringArray(),
    behavior: { type: "string" },
    accessibility: { type: "string" },
    responsive: { type: "string" },
    useWhen: { type: "string" },
    avoidWhen: { type: "string" },
    related: stringArray()
  },
  required: ["name", "purpose"],
  additionalProperties: false
};
var patternSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    purpose: { type: "string" },
    composition: stringArray(),
    behavior: { type: "string" },
    responsive: { type: "string" },
    accessibility: { type: "string" },
    guidance: { type: "string" },
    tokens: stringArray()
  },
  required: ["name", "purpose"],
  additionalProperties: false
};
function stringArray() {
  return { type: "array", items: { type: "string" } };
}
function skillBody() {
  return PORTABLE_SKILL.replace(/^---\n[\s\S]*?\n---\n\n/, "");
}
async function readRelevantSystem(root, task) {
  try {
    const manifest = await readManifest(root);
    const tokenDoc = await readJson(root, `${DESIGN_SYSTEM_DIR}/${manifest.tokens}`);
    const preferences = await readJson(root, `${DESIGN_SYSTEM_DIR}/${manifest.preferences}`);
    const guidelines = await readText(root, `${DESIGN_SYSTEM_DIR}/${manifest.guidelines}`);
    const foundations = await readText(root, `${DESIGN_SYSTEM_DIR}/${manifest.foundations}`);
    const decisions = await readText(root, `${DESIGN_SYSTEM_DIR}/${manifest.decisions}`);
    const terms = `${task} ${taskTerms(task)}`.toLowerCase();
    const componentEntries = manifest.components.filter((item) => terms.includes(item.name.toLowerCase()) || item.tokens.some((token) => terms.split(/\W+/).some((term) => term.length > 3 && token.includes(term))));
    const patternEntries = manifest.patterns.filter((item) => terms.includes(item.name.toLowerCase()));
    for (const item of manifest.components) {
      if (componentEntries.includes(item)) continue;
      if (await fileExists(root, `${DESIGN_SYSTEM_DIR}/${item.file}`)) {
        const summary = (await readText(root, `${DESIGN_SYSTEM_DIR}/${item.file}`)).toLowerCase();
        if (summary.split(/\W+/).some((term) => term.length > 4 && terms.includes(term))) componentEntries.push(item);
      }
    }
    for (const item of manifest.patterns) {
      if (patternEntries.includes(item)) continue;
      if (await fileExists(root, `${DESIGN_SYSTEM_DIR}/${item.file}`)) {
        const summary = (await readText(root, `${DESIGN_SYSTEM_DIR}/${item.file}`)).toLowerCase();
        if (summary.split(/\W+/).some((term) => term.length > 4 && terms.includes(term))) patternEntries.push(item);
      }
    }
    if (!componentEntries.length) componentEntries.push(...manifest.components.slice(0, 5));
    if (!patternEntries.length) patternEntries.push(...manifest.patterns.slice(0, 3));
    const components = await Promise.all(componentEntries.slice(0, 8).map(async (item) => ({ ...item, content: await readText(root, `${DESIGN_SYSTEM_DIR}/${item.file}`) })));
    const patterns = await Promise.all(patternEntries.slice(0, 5).map(async (item) => ({ ...item, content: await readText(root, `${DESIGN_SYSTEM_DIR}/${item.file}`) })));
    const preferredPaths = new Set([...components, ...patterns].flatMap((item) => item.tokens));
    const selectedTokens = selectTokens(tokenDoc, task, preferredPaths, 90);
    const relevantFoundations = selectFoundationSections(foundations, task);
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
        files: { tokens: manifest.tokens, foundations: manifest.foundations, guidelines: manifest.guidelines, preferences: manifest.preferences, decisions: manifest.decisions }
      },
      guidelines,
      preferences,
      decisions: decisions.slice(-5e3),
      foundations: relevantFoundations,
      tokens: selectedTokens,
      components,
      patterns,
      excluded: manifest.components.filter((item) => !componentEntries.includes(item)).map((item) => item.name)
    };
  } catch (error) {
    if (error.code !== "ENOENT") {
      return { exists: false, error: error instanceof Error ? error.message : String(error), nextStep: "Use design_system_analyze if documenting an existing app, or create a new Design System first." };
    }
    return { exists: false, nextStep: "Use design_system_analyze if the project already has UI, or ask for the user's visual direction before creating a new system." };
  }
}
function taskTerms(task) {
  const lower = task.toLowerCase();
  const groups = [
    [/form|login|sign.?in|settings|input|field|validation|filter|search/, "button input textarea select checkbox radio switch form"],
    [/table|list|admin|management|users|records/, "table pagination card badge navigation sidebar"],
    [/nav|menu|header|sidebar|breadcrumb/, "navigation menu header sidebar breadcrumb"],
    [/modal|dialog|confirm|delete|destructive/, "modal drawer alert button"],
    [/empty|loading|error|success|toast/, "empty state loading skeleton alert toast"]
  ];
  return groups.filter(([pattern]) => pattern.test(lower)).map(([, terms]) => terms).join(" ");
}
function selectTokens(document, task, preferredPaths, limit) {
  const themes = document.themes ?? {};
  const taskTermsLower = `${task} ${taskTerms(task)}`.toLowerCase();
  const selected = { schemaVersion: document.schemaVersion, themes: {} };
  for (const [themeName, value] of Object.entries(themes)) {
    if (!value || typeof value !== "object") continue;
    const theme = {};
    let remaining = limit;
    for (const group of Object.keys(value)) {
      const flattened = flatten(value[group], group);
      const candidates = flattened.filter(({ path: tokenPath }) => preferredPaths.has(tokenPath) || tokenPath.split(".").some((part) => part.length > 3 && taskTermsLower.includes(part.toLowerCase())));
      const baseline = flattened.filter(({ path: tokenPath }) => baselineTokenPath(tokenPath));
      const chosen = (candidates.length ? candidates : baseline).slice(0, remaining);
      if (chosen.length) {
        theme[group] = unflattenGroup(chosen);
        remaining -= chosen.length;
      }
      if (remaining <= 0) break;
    }
    ;
    selected.themes[themeName] = theme;
    if (remaining <= 0) break;
  }
  return selected;
}
function baselineTokenPath(tokenPath) {
  return /^color\.(?:surface\.(?:base|raised)|text\.(?:primary|secondary)|accent\.primary|border\.subtle|focus\.ring)$/.test(tokenPath) || /^spacing\.(?:xs|sm|md|lg|control)$/.test(tokenPath) || /^radius\.(?:control|card|sm|md|lg)$/.test(tokenPath) || /^typography\.(?:fontFamily\.sans|fontSize\.(?:body|heading|title))$/.test(tokenPath) || /^breakpoints\.(?:compact|tablet|wide|desktop)$/.test(tokenPath) || /^(?:elevation|motion)\.(?:surface|dialog|popover|duration|easing)$/.test(tokenPath);
}
function flatten(value, prefix) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [{ path: prefix, value }];
  return Object.entries(value).flatMap(([key, item]) => flatten(item, `${prefix}.${key}`));
}
function unflattenGroup(items) {
  const result = {};
  for (const item of items) {
    const parts = item.path.split(".").slice(1);
    let current = result;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) current[part] = item.value;
      else current = current[part] ??= {};
    });
  }
  return result;
}
function selectFoundationSections(markdown, task) {
  const relevant = `${task} ${taskTerms(task)}`.toLowerCase().split(/\W+/).filter((term) => term.length > 3);
  const sections = markdown.split(/(?=^#{1,3} )/m);
  const selected = sections.filter((section2, index) => {
    if (index === 0) return true;
    const heading = section2.slice(0, section2.indexOf("\n")).toLowerCase();
    return /accessibility|responsive|interaction|state/.test(heading) || relevant.some((term) => heading.includes(term));
  });
  return selected.join("\n").slice(0, 9e3);
}
function summarizeAnalysis(analysis) {
  return {
    ...analysis,
    styleSources: analysis.styleSources.slice(0, 20).map((item) => ({ ...item, variables: item.variables.slice(0, 20), colors: item.colors.slice(0, 20), radii: item.radii.slice(0, 12) })),
    colors: analysis.colors.slice(0, 20),
    radii: analysis.radii.slice(0, 16),
    spacing: analysis.spacing.slice(0, 18),
    componentCandidates: analysis.componentCandidates.slice(0, 30)
  };
}
export {
  index_default as default
};
