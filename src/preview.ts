import type { ComponentDefinition, DesignSystemManifest, PatternDefinition } from "./types.js"
import { createPreviewHtml as renderPreviewHtml } from "../templates/preview-renderer.mjs"

export function createPreviewHtml(input: {
  manifest: DesignSystemManifest
  tokens: Record<string, unknown>
  components: ComponentDefinition[]
  patterns: PatternDefinition[]
}): string {
  return renderPreviewHtml(input)
}
