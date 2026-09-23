export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export interface ComponentDefinition {
  name: string
  purpose: string
  variants?: string[]
  sizes?: string[]
  tokens?: string[]
  states?: string[]
  behavior?: string
  accessibility?: string
  responsive?: string
  useWhen?: string
  avoidWhen?: string
  related?: string[]
}

export interface PatternDefinition {
  name: string
  purpose: string
  composition?: string[]
  behavior?: string
  responsive?: string
  accessibility?: string
  guidance?: string
  tokens?: string[]
}

export interface Preference {
  key: string
  value: string | boolean | number
  explicit?: boolean
  rationale?: string
}

export interface DesignSystemManifest {
  designSystemVersion: string
  schemaVersion: string
  status: "draft" | "review" | "stable"
  name: string
  description: string
  createdAt: string
  updatedAt: string
  source: {
    type: "from-scratch" | "existing-project"
    evidence?: string[]
  }
  themes: string[]
  tokens: string
  preferences: string
  foundations: string
  guidelines: string
  decisions: string
  changelog: string
  preview: string
  screens: string
  schema: {
    manifest: string
    tokens: string
  }
  components: Array<{ name: string; file: string; tokens: string[] }>
  patterns: Array<{ name: string; file: string; tokens: string[] }>
}

export interface CreateInput {
  name: string
  description: string
  tokens: Record<string, unknown>
  foundations: string
  preferences?: Preference[]
  components?: ComponentDefinition[]
  patterns?: PatternDefinition[]
  sourceType?: "from-scratch" | "existing-project"
  evidence?: string[]
  status?: "draft" | "review" | "stable"
}

export interface TokenUpdate {
  path: string
  value: string | number | boolean
  reason?: string
}

export interface TokenAddition {
  path: string
  values: Record<string, string | number | boolean>
  reason?: string
}

export interface UpdateInput {
  request: string
  tokenUpdates: TokenUpdate[]
  tokenAdds?: TokenAddition[]
  componentUpdates?: Array<{ name: string; content: string }>
  patternUpdates?: Array<{ name: string; content: string }>
  newComponents?: ComponentDefinition[]
  newPatterns?: PatternDefinition[]
  preferenceUpdates?: Preference[]
  foundationUpdate?: string
  decision: string
  impact: "patch" | "minor" | "major"
  status?: "draft" | "review" | "stable"
}

export interface ManifestRecord {
  name: string
  file: string
  tokens: string[]
}
