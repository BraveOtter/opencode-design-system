export const manifestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://opencode.design/schema/manifest-1.0.json",
  title: "OpenCode Design System manifest",
  type: "object",
  required: [
    "designSystemVersion", "schemaVersion", "status", "name", "description", "source", "themes",
    "tokens", "preferences", "foundations", "guidelines", "decisions", "preview", "screens", "components", "patterns",
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
      properties: { type: { enum: ["from-scratch", "existing-project"] }, evidence: { type: "array", items: { type: "string" } } },
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
    patterns: { type: "array", items: { $ref: "#/$defs/document" } },
  },
  $defs: {
    document: {
      type: "object",
      required: ["name", "file", "tokens"],
      properties: { name: { type: "string" }, file: { type: "string" }, tokens: { type: "array", items: { type: "string" } } },
    },
  },
} as const

export const tokensSchema = {
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
      additionalProperties: { type: "object" },
    },
  },
  additionalProperties: true,
} as const

export function validateTokens(value: Record<string, unknown>): string[] {
  const errors: string[] = []
  if (typeof value.schemaVersion !== "string") errors.push("tokens.schemaVersion must be a string")
  if (!value.themes || typeof value.themes !== "object" || Array.isArray(value.themes)) {
    errors.push("tokens.themes must be an object containing at least one theme")
  } else if (Object.keys(value.themes as object).length === 0) {
    errors.push("tokens.themes must contain at least one theme")
  }
  const themes = value.themes as Record<string, unknown> | undefined
  for (const [name, theme] of Object.entries(themes ?? {})) {
    if (!theme || typeof theme !== "object" || Array.isArray(theme)) errors.push(`tokens.themes.${name} must be an object`)
  }
  return errors
}
