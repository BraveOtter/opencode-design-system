// src/index.ts
import { existsSync } from "fs";
import path5 from "path";
import { Plugin } from "@opencode/plugin";

// src/generator.ts
import { lstat, mkdir as mkdir2, readFile as readFile2, readdir, rename as rename2, rm as rm2, rmdir, writeFile as writeFile2 } from "fs/promises";
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

Honor explicit decisions in [design-system/preferences.json](design-system/preferences.json) and [design-system/DECISIONS.md](design-system/DECISIONS.md). Do not add arbitrary visual values or redesign existing identity during analysis. A screen brief is a design artifact in [design-system/screens/](design-system/screens/); implementation is a separate step. This guidance is intentionally tool- and framework-independent: any coding agent can use the Design System without this plugin or project-local copies of plugin agents, commands, or skills.
${AGENTS_END}`;
}
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

// templates/preview-renderer.mjs
var TOKEN_ROLE_PATHS = {
  canvas: ["color.canvas", "color.surface.base", "surface.canvas"],
  surface: ["color.surface", "color.surface.raised", "surface.raised"],
  text: ["color.text", "color.text.primary", "text.primary"],
  muted: ["color.muted", "color.text.secondary", "text.secondary"],
  brand: ["color.brand", "color.accent.primary", "color.primary", "brand"],
  brandHover: ["color.brandHover", "color.accent.hover", "color.accent.primary.hover", "color.brand.hover"],
  brandSubtle: ["color.brandSubtle", "color.accent.subtle", "color.brand.subtle"],
  onBrand: ["color.onBrand", "color.onAccent", "color.on.accent", "color.text.onBrand"],
  border: ["color.border", "color.border.subtle", "border.subtle"],
  borderStrong: ["color.border.strong", "border.strong", "color.border"],
  focus: ["color.focus", "color.focus.ring", "color.focusRing", "focus.ring"],
  success: ["color.success", "color.status.success", "color.status.positive", "status.success"],
  warning: ["color.warning", "color.status.warning", "status.warning"],
  danger: ["color.danger", "color.status.danger", "status.danger"],
  controlRadius: ["radius.control", "borderRadius.control"],
  cardRadius: ["radius.card", "borderRadius.card"],
  tagRadius: ["radius.tag", "radius.pill", "borderRadius.tag"],
  bodyFont: ["typography.body", "typography.fontFamily.sans", "typography.font-family-sans"]
};
var DEFAULT_ROLES = {
  canvas: "#f5f3f0",
  surface: "#ffffff",
  text: "#292724",
  muted: "#6b6862",
  brand: "#5b524b",
  brandHover: "#4a433d",
  brandSubtle: "#e9e4df",
  onBrand: "#ffffff",
  border: "#d9d4ce",
  borderStrong: "#b9b1a8",
  focus: "#8a6d52",
  success: "#43735a",
  warning: "#946b2e",
  danger: "#9b4a47",
  controlRadius: "0.5rem",
  cardRadius: "0.75rem",
  tagRadius: "9999px",
  bodyFont: "Inter, ui-sans-serif, system-ui, sans-serif"
};
function createPreviewHtml({ manifest, tokens, components, patterns }) {
  const themes = tokens?.themes && typeof tokens.themes === "object" ? tokens.themes : {};
  const themeNames = Object.keys(themes);
  const firstTheme = themeNames[0] ?? "light";
  const themeData = Object.fromEntries(themeNames.map((name) => [name, normalizeTheme(themes[name])]));
  const componentCards = components.map((component, index) => componentCard(component, index)).join("\n");
  const patternCards = patterns.map((pattern) => `
    <article class="spec-card">
      <p class="eyebrow">Pattern</p><h3>${escapeHtml(pattern.name)}</h3>
      <p>${escapeHtml(pattern.purpose)}</p>
      <p class="muted">${escapeHtml(pattern.guidance && pattern.guidance !== pattern.purpose ? pattern.guidance : pattern.composition?.join(" \xB7 ") || pattern.guidance || "")}</p>
    </article>`).join("\n");
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
    :root{color-scheme:light;--preview-canvas:#f5f3f0;--preview-surface:#fff;--preview-text:#292724;--preview-muted:#6b6862;--preview-brand:#5b524b;--preview-brand-hover:#4a433d;--preview-brand-subtle:#e9e4df;--preview-on-brand:#fff;--preview-border:#d9d4ce;--preview-border-strong:#b9b1a8;--preview-focus:#8a6d52;--preview-success:#43735a;--preview-warning:#946b2e;--preview-danger:#9b4a47;--preview-control-radius:.5rem;--preview-card-radius:.75rem;--preview-tag-radius:9999px;--preview-body-font:Inter,ui-sans-serif,system-ui,sans-serif;font-family:var(--preview-body-font);color:var(--preview-text);background:var(--preview-canvas);font-synthesis:none;line-height:1.5}
    *{box-sizing:border-box}body{margin:0;background:var(--preview-canvas);color:var(--preview-text)}button,input,select{font:inherit}button{cursor:pointer}a{color:var(--preview-brand)}
    .shell{min-height:100vh;display:grid;grid-template-columns:250px minmax(0,1fr)}.sidebar{padding:28px 20px;border-right:1px solid var(--preview-border);background:var(--preview-surface)}.brand{font-size:1.05rem;font-weight:750;margin-bottom:4px}.side-note,.muted{color:var(--preview-muted);font-size:.88rem}.nav{display:grid;gap:6px;margin:28px 0}.nav a{padding:8px 10px;text-decoration:none;border-radius:var(--preview-control-radius);color:var(--preview-muted)}.nav a:hover{background:var(--preview-canvas);color:var(--preview-text)}.nav-label{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--preview-muted);margin:20px 8px 8px}
    main{min-width:0;padding:34px clamp(20px,5vw,72px) 72px;max-width:1440px}.topbar{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:34px}.eyebrow{font-size:.72rem;text-transform:uppercase;letter-spacing:.1em;font-weight:700;color:var(--preview-muted);margin:0 0 5px}.hero h1{font-size:clamp(2rem,4vw,3.4rem);letter-spacing:-.045em;line-height:1.08;margin:0}.hero>p{max-width:720px;color:var(--preview-muted)}.status{display:inline-flex;border:1px solid var(--preview-border);border-radius:var(--preview-tag-radius);padding:3px 10px;font-size:.76rem;text-transform:uppercase;letter-spacing:.06em}
    section{margin-top:54px;scroll-margin-top:20px}.section-heading{display:flex;justify-content:space-between;align-items:end;gap:16px;border-bottom:1px solid var(--preview-border);padding-bottom:12px;margin-bottom:18px}.section-heading h2{margin:0;font-size:1.45rem;letter-spacing:-.025em}.section-heading p{margin:0;color:var(--preview-muted);font-size:.9rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:14px}.spec-card,.surface{border:1px solid var(--preview-border);border-radius:var(--preview-card-radius);background:var(--preview-surface);padding:18px}.spec-card h3{margin:0 0 8px;font-size:1.05rem}.spec-card p{color:var(--preview-muted);margin:8px 0}.spec-card small{display:block;margin-top:12px;color:var(--preview-muted)}.spec-heading{display:flex;justify-content:space-between;align-items:center;gap:12px}.tag{border-radius:var(--preview-tag-radius);background:var(--preview-brand-subtle);color:var(--preview-brand);padding:3px 8px;font-size:.75rem}.showcase{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:16px 0 4px}.button{border:1px solid var(--preview-brand);border-radius:var(--preview-control-radius);background:var(--preview-brand);color:var(--preview-on-brand);padding:9px 14px;min-height:40px;font-weight:650;transition:background 140ms ease,border-color 140ms ease,transform 140ms ease,box-shadow 140ms ease}.button:not(.secondary):not(:disabled):hover{background:var(--preview-brand-hover);border-color:var(--preview-brand-hover)}.button.secondary:not(:disabled):hover{background:var(--preview-canvas)}.button:active{transform:translateY(1px)}.button:focus-visible,input:focus-visible,select:focus-visible,.tab:focus-visible,.switch:focus-visible{outline:3px solid var(--preview-focus);outline-offset:2px}.button.secondary{background:var(--preview-surface);color:var(--preview-text);border-color:var(--preview-border-strong)}.button:disabled{opacity:.5;cursor:not-allowed}.button.magnetic{transform:perspective(var(--token-depth-buttonPerspective,600px)) translate3d(var(--magnet-x,0px),var(--magnet-y,0px),0) rotateX(var(--magnet-rx,0deg)) rotateY(var(--magnet-ry,0deg));transform-style:preserve-3d;will-change:transform}.button.magnetic[data-moving="true"]{transition:background 140ms ease,border-color 140ms ease,box-shadow 140ms ease}.button.magnetic:focus-visible{transform:none;will-change:auto}
    .field-label{display:grid;gap:5px;font-size:.82rem;color:var(--preview-text)}.field-label input{min-height:40px;border:1px solid var(--preview-border-strong);border-radius:var(--preview-control-radius);padding:8px 10px;background:var(--preview-canvas);color:var(--preview-text)}.field-label input[aria-invalid="true"]{border-color:var(--preview-danger)}.feedback{min-height:1.5em;font-size:.82rem;color:var(--preview-muted)}.feedback[data-state="error"]{color:var(--preview-danger)}.feedback[data-state="success"]{color:var(--preview-success)}.demo-surface{min-height:72px;padding:14px;border:1px solid var(--preview-border);border-radius:var(--preview-control-radius);background:var(--preview-canvas)}.demo-surface strong{display:block}.badge{display:inline-flex;align-items:center;gap:7px;border-radius:var(--preview-tag-radius);padding:5px 10px;background:var(--preview-brand-subtle);color:var(--preview-brand);font-size:.82rem}.badge::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}.badge.success{background:color-mix(in srgb,var(--preview-success) 14%,var(--preview-surface));color:var(--preview-success)}.badge.warning{background:color-mix(in srgb,var(--preview-warning) 14%,var(--preview-surface));color:var(--preview-warning)}.badge.danger{background:color-mix(in srgb,var(--preview-danger) 14%,var(--preview-surface));color:var(--preview-danger)}
    .token-table{display:grid;gap:18px}.token-group h3{font-size:.95rem;margin:0 0 10px;text-transform:capitalize}.swatches{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.swatch{overflow:hidden;border:1px solid var(--preview-border);border-radius:var(--preview-control-radius);background:var(--preview-surface)}.swatch-color,.token-demo{height:58px;display:grid;place-items:center;border-bottom:1px solid var(--preview-border);background:var(--preview-canvas);overflow:hidden}.swatch-color{background:var(--swatch-color)}.token-demo-sample{display:block;min-width:12px;min-height:8px;background:var(--preview-brand)}.token-demo[data-group="spacing"] .token-demo-sample{height:8px}.token-demo[data-group="typography"] .token-demo-sample{min-width:0;min-height:0;background:transparent;color:var(--preview-text)}.token-label{padding:8px 10px;font-size:.75rem}.token-label code{display:block;overflow-wrap:anywhere;color:var(--preview-muted);font-size:.68rem}
    .magnetic-note{font-size:.75rem;color:var(--preview-muted)}.identity-scene{perspective:var(--token-depth-cardPerspective,var(--token-depth-identityPerspective,1200px));padding:10px 6px 18px;max-width:340px}.identity-card{min-height:190px;padding:18px;border:1px solid var(--preview-border);border-radius:var(--preview-card-radius);background:var(--preview-surface);box-shadow:0 14px 34px color-mix(in srgb,var(--preview-text) 14%,transparent);transform:rotateX(var(--card-rx,0deg)) rotateY(var(--card-ry,0deg)) translateZ(var(--card-lift,0px));transform-style:preserve-3d;transition:transform 240ms ease,box-shadow 240ms ease;will-change:transform}.identity-card[data-moving="true"]{transition:none}.identity-mark{color:var(--preview-brand);font-weight:750;letter-spacing:.04em}.identity-divider{height:1px;margin:12px 0;background:var(--preview-border)}.identity-name{font-size:1.1rem;font-weight:700}.identity-meta{font-size:.78rem;color:var(--preview-muted)}
    .component-nav{padding-left:18px}.component-nav a{color:var(--preview-muted);text-decoration:none}.component-nav a:hover{color:var(--preview-brand)}.warning-note{padding:10px 12px;border:1px solid var(--preview-warning);border-radius:var(--preview-control-radius);color:var(--preview-text);font-size:.85rem}.warning-note[hidden]{display:none}.tabs{display:flex;gap:6px}.tab,.switch{border:1px solid var(--preview-border-strong);border-radius:var(--preview-control-radius);background:var(--preview-surface);color:var(--preview-text);padding:7px 10px}.tab[aria-selected="true"]{border-color:var(--preview-brand);color:var(--preview-brand)}.switch{width:46px;height:26px;padding:2px;border-radius:999px;background:var(--preview-border);position:relative}.switch::after{content:"";display:block;width:20px;height:20px;border-radius:50%;background:var(--preview-surface);transition:transform 140ms ease}.switch[aria-checked="true"]{background:var(--preview-brand)}.switch[aria-checked="true"]::after{transform:translateX(20px)}.switch-row{display:flex;align-items:center;gap:10px}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:.85rem}th,td{text-align:left;padding:9px;border-bottom:1px solid var(--preview-border)}.overlay{position:fixed;inset:0;display:none;place-items:center;padding:20px;background:rgb(0 0 0 / .45);z-index:5}.overlay.open{display:grid}.dialog{width:min(100%,440px);padding:22px;border-radius:var(--preview-card-radius);background:var(--preview-surface);box-shadow:0 20px 60px rgb(0 0 0 / .25)}.toast{position:fixed;right:20px;bottom:20px;z-index:8;padding:12px 16px;border-radius:var(--preview-control-radius);background:var(--preview-text);color:var(--preview-canvas);opacity:0;transform:translateY(8px);pointer-events:none;transition:opacity 160ms ease,transform 160ms ease}.toast.show{opacity:1;transform:translateY(0)}
    @media(max-width:760px){.shell{grid-template-columns:1fr}.sidebar{border-right:0;border-bottom:1px solid var(--preview-border);padding:14px 18px}.nav{display:flex;overflow:auto;margin:12px 0 0}.nav a{white-space:nowrap}.sidebar .nav-label,.sidebar .side-note,.sidebar ul{display:none}main{padding:24px 18px 54px}.topbar{align-items:flex-start}.component-nav{display:none}.section-heading{align-items:flex-start;flex-direction:column}}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition-duration:.01ms!important;animation-duration:.01ms!important;animation-iteration-count:1!important}.button.magnetic,.identity-card{transform:none!important;will-change:auto!important}}
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
      <div class="topbar"><div class="status">${escapeHtml(manifest.status)}</div><button class="button secondary" id="theme-toggle" type="button" aria-label="Toggle color theme">Toggle theme</button></div>
      <header id="overview" class="hero"><p class="eyebrow">Framework-neutral design language</p><h1>${escapeHtml(manifest.name)}</h1><p>${escapeHtml(manifest.description)}</p></header>
      <p id="token-warning" class="warning-note" role="status" hidden></p>
      <section id="colors"><div class="section-heading"><div><p class="eyebrow">Foundations</p><h2>Semantic tokens</h2></div><p>Values generated from tokens.json</p></div><div id="token-groups" class="token-table"></div></section>
      <section id="components"><div class="section-heading"><div><p class="eyebrow">Building blocks</p><h2>Components</h2></div><p>${components.length} documented</p></div><div class="grid">${componentCards || `<p class="muted">No components documented yet.</p>`}</div></section>
      <section id="patterns"><div class="section-heading"><div><p class="eyebrow">Compositions</p><h2>Patterns</h2></div><p>${patterns.length} documented</p></div><div class="grid">${patternCards || `<p class="muted">No patterns documented yet.</p>`}</div></section>
      <section id="interactions"><div class="section-heading"><div><p class="eyebrow">Try it</p><h2>Interactive states</h2></div><p>Local examples \xB7 no application services</p></div>
        <div class="grid">
          <article class="spec-card"><h3>Tabs</h3><div class="tabs" role="tablist" aria-label="Preview tabs"><button class="tab" role="tab" aria-selected="true" aria-controls="tab-a" id="tab-button-a">General</button><button class="tab" role="tab" aria-selected="false" aria-controls="tab-b" id="tab-button-b" tabindex="-1">Advanced</button></div><div id="tab-a" class="tab-panel" role="tabpanel" aria-labelledby="tab-button-a">General settings are visible.</div><div id="tab-b" class="tab-panel" role="tabpanel" aria-labelledby="tab-button-b" hidden>Advanced options are available here.</div></article>
          <article class="spec-card"><h3>Switch</h3><div class="switch-row"><button class="switch" type="button" role="switch" aria-checked="false" aria-label="Enable notifications"></button><span>Enable notifications</span></div></article>
          <article class="spec-card"><h3>Dialog and toast</h3><div class="showcase"><button class="button" type="button" id="open-dialog">Open dialog</button><button class="button secondary" type="button" id="show-toast">Show toast</button></div></article>
          <article class="spec-card"><h3>Data table</h3><div class="table-wrap"><table><thead><tr><th>Name</th><th>Status</th><th>Role</th></tr></thead><tbody><tr><td>Jordan Lee</td><td><span class="tag">Active</span></td><td>Editor</td></tr><tr><td>Sam Rivera</td><td>Invited</td><td>Admin</td></tr></tbody></table></div></article>
        </div>
      </section>
      <footer class="spec-card"><p>Generated from manifest.json, tokens.json, component specifications, and patterns. Edit the structured sources and regenerate this preview.</p></footer>
    </main>
  </div>
  <div class="overlay" id="dialog-overlay" aria-hidden="true"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h3 id="dialog-title">Confirm an action</h3><p>This local dialog demonstrates the documented surface and focus treatment.</p><div class="showcase"><button class="button" type="button" id="close-dialog">Continue</button><button class="button secondary" type="button" id="cancel-dialog">Cancel</button></div></section></div>
  <div class="toast" id="toast" role="status" aria-live="polite">Changes saved</div>
  <script type="application/json" id="theme-data">${safeJson(themeData)}</script>
  <script>
    const themes=JSON.parse(document.getElementById('theme-data').textContent||'{}');
    const themeNames=Object.keys(themes);const themeToggle=document.getElementById('theme-toggle');
    function flatten(value,prefix='',out=[]){if(value&&typeof value==='object'&&!Array.isArray(value)){for(const [key,item] of Object.entries(value))flatten(item,prefix?prefix+'.'+key:key,out)}else if(['string','number','boolean'].includes(typeof value))out.push({path:prefix,value:String(value)});return out}
    function setTheme(name){const theme=themes[name];if(!theme)return;document.documentElement.dataset.theme=name;document.documentElement.style.colorScheme=/dark/i.test(name)?'dark':'light';for(const [key,value] of Object.entries(theme.roles||{}))document.documentElement.style.setProperty('--preview-'+key.replace(/[A-Z]/g,letter=>'-'+letter.toLowerCase()),value);for(const property of [...document.documentElement.style])if(property.startsWith('--token-'))document.documentElement.style.removeProperty(property);for(const token of flatten(theme.tokens)){if(/^[w-]+(?:.[w-]+)*$/.test(token.path))document.documentElement.style.setProperty('--token-'+token.path.replaceAll('.','-'),token.value)}themeToggle.hidden=themeNames.length<2;renderTokens(theme.tokens);const missing=theme.missing||[];const warning=document.getElementById('token-warning');warning.hidden=missing.length===0;warning.textContent=missing.length?'Some preview roles use neutral defaults because matching semantic tokens were not found: '+missing.join(', ')+'.':''}
    function renderTokens(theme){const holder=document.getElementById('token-groups');holder.replaceChildren();for(const [group,values] of Object.entries(theme||{})){if(!values||typeof values!=='object'||Array.isArray(values))continue;const section=document.createElement('div');section.className='token-group';const heading=document.createElement('h3');heading.textContent=group;section.append(heading);const swatches=document.createElement('div');swatches.className='swatches';for(const token of flatten(values,group)){const card=document.createElement('div');card.className='swatch';const sample=document.createElement('div');if(group==='color'){sample.className='swatch-color';sample.style.setProperty('--swatch-color',token.value)}else{sample.className='token-demo';sample.dataset.group=group;const shape=document.createElement('span');shape.className='token-demo-sample';shape.textContent=group==='typography'?'Aa':'';if(group==='spacing')shape.style.width=token.value;if(group==='radius'){shape.style.width='42px';shape.style.height='28px';shape.style.borderRadius=token.value}if(group==='typography'&&/family|body/i.test(token.path))shape.style.fontFamily=token.value;if(group==='typography'&&/size/i.test(token.path))shape.style.fontSize=token.value;if(group==='elevation')shape.style.boxShadow=token.value;sample.append(shape)}const label=document.createElement('div');label.className='token-label';const name=document.createElement('strong');name.textContent=token.path;const code=document.createElement('code');code.textContent=token.value;label.append(name,code);card.append(sample,label);swatches.append(card)}section.append(swatches);holder.append(section)}}
    themeToggle.addEventListener('click',()=>{const index=themeNames.indexOf(document.documentElement.dataset.theme);setTheme(themeNames[(index+1)%themeNames.length])});
    for(const button of document.querySelectorAll('[role=tab]')){button.addEventListener('click',()=>{for(const tab of document.querySelectorAll('[role=tab]')){const selected=tab===button;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;document.getElementById(tab.getAttribute('aria-controls')).hidden=!selected}});button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const tabs=[...document.querySelectorAll('[role=tab]')];const next=(tabs.indexOf(button)+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length;tabs[next].focus();tabs[next].click()})}
    document.querySelector('[role=switch]').addEventListener('click',event=>{const control=event.currentTarget;control.setAttribute('aria-checked',String(control.getAttribute('aria-checked')!=='true'))});
    for(const button of document.querySelectorAll('[data-preview-action]'))button.addEventListener('click',()=>{const output=document.getElementById(button.dataset.feedbackTarget);if(output){output.textContent=button.dataset.previewAction+' activated.';output.dataset.state='success'}});
    for(const form of document.querySelectorAll('[data-preview-form]'))form.addEventListener('submit',event=>{event.preventDefault();const field=form.querySelector('input');const output=form.querySelector('.feedback');const valid=field.checkValidity();field.setAttribute('aria-invalid',String(!valid));output.dataset.state=valid?'success':'error';output.textContent=valid?'Example value is valid; no data was sent.':'Enter a valid value to see the success state.';if(!valid)field.focus()});
    const motion=window.matchMedia('(prefers-reduced-motion: reduce)');const finePointer=window.matchMedia('(hover: hover) and (pointer: fine)');
    function resetMagnet(element){element.dataset.moving='false';for(const key of ['--magnet-x','--magnet-y','--magnet-rx','--magnet-ry'])element.style.removeProperty(key)}
    for(const element of document.querySelectorAll('.magnetic')){let frame=0;element.addEventListener('pointermove',event=>{if(motion.matches||!finePointer.matches||event.pointerType==='touch')return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const rect=element.getBoundingClientRect();const x=(event.clientX-rect.left-rect.width/2)/rect.width;const y=(event.clientY-rect.top-rect.height/2)/rect.height;const tilt=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--token-depth-buttonTiltMax'))||10;const strength=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--token-depth-buttonTranslation'))||.2;element.dataset.moving='true';element.style.setProperty('--magnet-x',(x*rect.width*strength)+'px');element.style.setProperty('--magnet-y',(y*rect.height*strength)+'px');element.style.setProperty('--magnet-rx',(y*tilt)+'deg');element.style.setProperty('--magnet-ry',(-x*tilt)+'deg')})});for(const type of ['pointerleave','pointercancel','blur'])element.addEventListener(type,()=>{cancelAnimationFrame(frame);resetMagnet(element)});motion.addEventListener('change',()=>resetMagnet(element))}
    for(const card of document.querySelectorAll('[data-tilt-card]')){let frame=0;function reset(){card.dataset.moving='false';for(const key of ['--card-rx','--card-ry','--card-lift'])card.style.removeProperty(key)}card.addEventListener('pointermove',event=>{if(motion.matches||!finePointer.matches||event.pointerType==='touch')return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const rect=card.getBoundingClientRect();const x=(event.clientX-rect.left-rect.width/2)/rect.width;const y=(event.clientY-rect.top-rect.height/2)/rect.height;const tilt=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--token-depth-cardTiltMax')||getComputedStyle(document.documentElement).getPropertyValue('--token-depth-identityTiltMax'))||12;const lift=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--token-depth-cardLift')||getComputedStyle(document.documentElement).getPropertyValue('--token-depth-identityLiftMax'))||10;card.dataset.moving='true';card.style.setProperty('--card-rx',(y*tilt)+'deg');card.style.setProperty('--card-ry',(-x*tilt)+'deg');card.style.setProperty('--card-lift',lift+'px')})});for(const type of ['pointerleave','pointercancel'])card.addEventListener(type,()=>{cancelAnimationFrame(frame);reset()});motion.addEventListener('change',reset)}
    const overlay=document.getElementById('dialog-overlay');const open=document.getElementById('open-dialog');function closeDialog(){overlay.classList.remove('open');overlay.setAttribute('aria-hidden','true');open.focus()}open.addEventListener('click',()=>{overlay.classList.add('open');overlay.setAttribute('aria-hidden','false');document.getElementById('close-dialog').focus()});document.getElementById('close-dialog').addEventListener('click',closeDialog);document.getElementById('cancel-dialog').addEventListener('click',closeDialog);overlay.addEventListener('click',event=>{if(event.target===overlay)closeDialog()});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&overlay.classList.contains('open'))closeDialog()});let toastTimeout;document.getElementById('show-toast').addEventListener('click',()=>{const toast=document.getElementById('toast');toast.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>toast.classList.remove('show'),2200)});
    setTheme(${safeJson(firstTheme)});
  </script>
</body>
</html>
`;
}
function normalizeTheme(theme) {
  const roles = {};
  const missing = [];
  for (const [name, paths] of Object.entries(TOKEN_ROLE_PATHS)) {
    const value = firstTokenValue(theme, paths);
    if (value === void 0) {
      roles[name] = DEFAULT_ROLES[name];
      if (["canvas", "surface", "text", "brand", "border"].includes(name)) missing.push(name);
    } else roles[name] = value;
  }
  return { roles, missing, tokens: theme };
}
function firstTokenValue(theme, paths) {
  for (const path6 of paths) {
    let value = theme;
    for (const segment of path6.split(".")) value = value && typeof value === "object" ? value[segment] : void 0;
    if ((typeof value === "string" || typeof value === "number") && String(value).trim()) return String(value);
  }
  return void 0;
}
function componentCard(component, index) {
  const name = String(component.name ?? "Component");
  const tokens = component.tokens ?? [];
  const evidence = [name, component.behavior, ...component.variants ?? [], ...component.states ?? [], ...tokens].filter(Boolean).join(" ");
  const isButton = /button|action/i.test(name);
  const isField = /input|field|search/i.test(name);
  const isStatus = /status|indicator|badge/i.test(name);
  const isIdentityCard = /profile|identity|credential/i.test(name) && /card|identity|credential/i.test(name) || tokens.some((token) => /depth\.(card|identity)(Perspective|TiltMax|Lift)/i.test(token));
  const magnetic = isButton && (/magnet/i.test(evidence) || tokens.some((token) => /depth\.(button|magnetic)/i.test(token)));
  let demo;
  if (isIdentityCard) demo = identityCardDemo(name);
  else if (isButton) demo = buttonDemo(name, index, magnetic);
  else if (isField) demo = fieldDemo(name, index);
  else if (isStatus) demo = `<div class="showcase"><span class="badge">In progress</span><span class="badge success">Complete</span><span class="badge warning">Needs review</span><span class="badge danger">Blocked</span></div>`;
  else demo = `<div class="demo-surface"><strong>${escapeHtml(name)} preview</strong><span class="muted">Static sample of the documented component.</span></div>`;
  const tokensHtml = tokens.length ? `<small>Tokens: ${tokens.map((token) => `<code>${escapeHtml(token)}</code>`).join(" ")}</small>` : "";
  return `
    <article class="spec-card">
      <div class="spec-heading"><div><p class="eyebrow">Component</p><h3>${escapeHtml(name)}</h3></div><span class="tag">${escapeHtml(component.variants?.[0] ?? "base")}</span></div>
      <p>${escapeHtml(component.purpose ?? "")}</p>
      <div class="showcase">${demo}</div>
      ${tokensHtml}
    </article>`;
}
function buttonDemo(name, index, magnetic) {
  const className = magnetic ? "button magnetic" : "button";
  const hint = magnetic ? `<span class="magnetic-note">Move the pointer to try the magnetic response.</span>` : "";
  return `<div class="showcase"><button class="${className}" type="button" data-preview-action="${escapeHtml(name)}" data-feedback-target="component-feedback-${index}">${escapeHtml(name)} action</button><button class="button secondary" type="button" data-preview-action="Secondary" data-feedback-target="component-feedback-${index}">Secondary</button><button class="button" type="button" disabled>Disabled</button></div><p class="feedback" id="component-feedback-${index}" role="status" aria-live="polite"></p>${hint}`;
}
function fieldDemo(name, index) {
  const id = `preview-field-${index}`;
  return `<form data-preview-form><label class="field-label" for="${id}">${escapeHtml(name)}<input id="${id}" type="email" autocomplete="off" placeholder="name@example.com" required aria-describedby="field-feedback-${index}" /></label><div class="showcase"><button class="button" type="submit">Validate example</button></div><p class="feedback" id="field-feedback-${index}" role="status" aria-live="polite"></p></form>`;
}
function identityCardDemo(name) {
  return `<div class="identity-scene"><article class="identity-card" data-tilt-card><div class="identity-mark">${escapeHtml(name)}</div><div class="identity-divider"></div><div class="identity-name">Alex Martin</div><div class="identity-meta">Workshop coordinator \xB7 sample identity</div></article></div><span class="magnetic-note">Move the pointer to explore the 3D identity card.</span>`;
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
function safeJson(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => ({ "<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "\u2028": "\\u2028", "\u2029": "\\u2029" })[character]);
}

// src/preview.ts
function createPreviewHtml2(input) {
  return createPreviewHtml(input);
}

// src/generator.ts
var SCHEMA_VERSION = "1.0.0";
var INITIAL_VERSION = "0.1.0";
async function createDesignSystem(root, input) {
  validateCreateInput(input);
  const target = resolveInside(root, DESIGN_SYSTEM_DIR);
  let existingDirectories = [];
  let targetExists = false;
  try {
    targetExists = true;
    const inspection = await inspectExistingDirectoryTree(target);
    if (inspection.userOwnedPaths.length > 0) {
      if (await fileExists(root, `${DESIGN_SYSTEM_DIR}/manifest.json`)) {
        throw new Error("A Design System already exists. Use design_system_read, then /design-system:update.");
      }
      const paths = inspection.userOwnedPaths.map((item) => path3.relative(root, item).split(path3.sep).join("/"));
      throw new Error(`design-system/ contains existing user-owned files or links: ${paths.join(", ")}. Review them before creating a system there.`);
    }
    existingDirectories = inspection.directories;
  } catch (error) {
    if (error.code === "ENOENT") {
      targetExists = false;
    } else {
      throw error;
    }
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
    ["tools/preview-renderer.mjs", await readFile2(new URL("../templates/preview-renderer.mjs", import.meta.url), "utf8")],
    ["preview/index.html", createPreviewHtml2({ manifest, tokens, components, patterns })]
  ]);
  for (const [index, component] of components.entries()) files.set(manifest.components[index].file, componentMarkdown(component));
  for (const [index, pattern] of patterns.entries()) files.set(manifest.patterns[index].file, patternMarkdown(pattern));
  const generatedFilePaths = new Set(files.keys());
  const directoryConflicts = existingDirectories.map((directory) => ({ directory, relative: path3.relative(target, directory).split(path3.sep).join("/") })).filter(({ relative }) => generatedFilePaths.has(relative));
  if (directoryConflicts.length > 0) {
    const paths = directoryConflicts.map(({ relative }) => `${DESIGN_SYSTEM_DIR}/${relative}`);
    throw new Error(`design-system/ has empty directories where generated files would be written: ${paths.join(", ")}. Review them before creating a system there.`);
  }
  await mkdir2(path3.dirname(target), { recursive: true });
  const staging = path3.join(path3.dirname(target), `.design-system-${randomUUID2()}`);
  try {
    for (const [relative, content] of files) {
      const destination = path3.join(staging, relative);
      await mkdir2(path3.dirname(destination), { recursive: true });
      await writeFile2(destination, content, "utf8");
    }
    if (targetExists) {
      for (const directory of [...existingDirectories].sort((left, right) => right.length - left.length)) {
        await rmdir(directory);
      }
    }
    await rename2(staging, target);
    if (targetExists) await restoreEmptyDirectories(existingDirectories);
  } catch (error) {
    await rm2(staging, { recursive: true, force: true }).catch(() => void 0);
    if (existingDirectories.length > 0) await restoreEmptyDirectories(existingDirectories);
    const code = error.code;
    if (targetExists && (code === "ENOTEMPTY" || code === "EEXIST" || code === "EPERM")) {
      throw new Error("design-system/ changed during creation or contains user-owned content. Existing files were preserved; review the folder and retry.");
    }
    throw error;
  }
  await updateManagedBlock(root, "AGENTS.md", "<!-- opencode-design-system:start -->", "<!-- opencode-design-system:end -->", projectAgentsBlock(manifest.name));
  return { success: true, manifest, files: [...files.keys()].map((file) => `${DESIGN_SYSTEM_DIR}/${file}`) };
}
async function regeneratePreview(root) {
  const manifest = await readManifest(root);
  const tokens = await readJson(root, `${DESIGN_SYSTEM_DIR}/${manifest.tokens}`);
  const components = await Promise.all(manifest.components.map(async (item) => parseComponent(item.name, await readText2(root, `${DESIGN_SYSTEM_DIR}/${item.file}`), item.tokens)));
  const patterns = await Promise.all(manifest.patterns.map(async (item) => parsePattern(item.name, await readText2(root, `${DESIGN_SYSTEM_DIR}/${item.file}`), item.tokens)));
  const html = createPreviewHtml2({ manifest, tokens, components, patterns });
  await atomicWrite(root, `${DESIGN_SYSTEM_DIR}/${manifest.preview}`, html);
  return { preview: `${DESIGN_SYSTEM_DIR}/${manifest.preview}`, componentCount: components.length, patternCount: patterns.length };
}
async function readManifest(root) {
  return readJson(root, `${DESIGN_SYSTEM_DIR}/manifest.json`);
}
var readText2 = readText;
async function inspectExistingDirectoryTree(target) {
  const directories = [];
  const userOwnedPaths = [];
  async function visit(directory) {
    const info = await lstat(directory);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      userOwnedPaths.push(directory);
      return;
    }
    directories.push(directory);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = path3.join(directory, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) await visit(child);
      else userOwnedPaths.push(child);
    }
  }
  await visit(target);
  return { directories, userOwnedPaths };
}
async function restoreEmptyDirectories(directories) {
  for (const directory of [...directories].sort((left, right) => left.length - right.length)) {
    await mkdir2(directory, { recursive: true }).catch(() => void 0);
  }
}
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

This project includes [tools/generate-preview.mjs](tools/generate-preview.mjs), a dependency-free Node.js renderer. After editing structured tokens/specifications without the plugin, run node design-system/tools/generate-preview.mjs from the project root. The project's [AGENTS.md](../AGENTS.md) block points any coding agent to the portable system; no project-local plugin agents, commands, or skills are required.
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
  const match = markdown.match(new RegExp(`^## ${heading}[ \\t]*\\r?\\n([\\s\\S]*?)(?=\\r?\\n## |(?![\\s\\S]))`, "mi"));
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
    instruction: `Act as a collaborative design-system designer. Gather only identity decisions that are genuinely unclear; honor explicit preferences. If a Design System already exists, read it and offer an update/continue path rather than overwriting it. If the repository has UI and the user has not said whether to formalize that UI or start fresh, call the read-only analysis tool and ask which path they prefer; do not assume. Distinguish evidence from inference and ask about important inconsistencies before normalization. For a new system, confirm a concise visual direction before writing files; then call design_system_create with neutral tokens, foundations, explicit preferences, a few useful components and patterns, and source evidence. Keep status draft until reviewed. Do not modify application files.

User request:`
  },
  {
    name: "design-system/update",
    description: "Make a coherent, versioned change to the existing Design System",
    instruction: `Work collaboratively as a design-system architect. Read the Design System first using design_system_read. Interpret the request semantically, identify impacted token paths and dependent components/patterns, and honor recorded decisions. If the request conflicts with an explicit preference, ask before changing it. For a clear requested change, apply it with design_system_update, explain the dependency impact, provide revised full componentUpdates/patternUpdates where documented behavior or guidance needs a semantic change, add tokens only when existing semantic paths do not fit and then provide a value for every theme, add reusable components/patterns when composition is insufficient, update preferences/decisions/foundations where appropriate, choose patch/minor/major impact (expansion requires at least minor), and report unresolved references. Do not use blind text replacement and do not modify app UI code.

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
    instruction: `Act as a UI/UX screen designer. First call design_system_read with the user's task to load only the relevant tokens, components, patterns, preferences, and guidelines. Clarify the screen's purpose and key content when needed, then define hierarchy, layout, data, states, interactions, responsive behavior, and accessibility. Keep design separate from implementation. Call design_system_screen_spec to save an implementation-ready Markdown specification under design-system/screens/. Do not write UI code unless asked separately.

User request:`
  }
];
var index_default = Plugin.define({
  id: "opencode-design-system",
  async setup(ctx) {
    const projectRoot = path5.resolve(ctx.location.project.canonical || ctx.location.directory);
    const designSystemPath = path5.join(projectRoot, DESIGN_SYSTEM_DIR, "manifest.json");
    await ctx.session.hook("context", (event) => {
      if (!existsSync(designSystemPath)) return;
      event.system.push({
        type: "text",
        text: "This project has a framework-neutral Design System at design-system/manifest.json. Follow the Design System guidance in AGENTS.md and design-system/AI-GUIDELINES.md; read only the relevant tokens, components, and patterns, and treat the HTML preview as generated output rather than the source of truth."
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
