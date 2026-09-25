type PreviewComponent = {
  name: string
  purpose: string
  file?: string
  variants?: string[]
  sizes?: string[]
  tokens?: string[]
  states?: string[]
  behavior?: string
}

type PreviewPattern = {
  name: string
  purpose: string
  file?: string
  guidance?: string
  composition?: string[]
  tokens?: string[]
}

export function createPreviewHtml(input: {
  manifest: {
    name: string
    designSystemVersion: string
    status: string
    description: string
    components: Array<{ name: string; file: string }>
    patterns: Array<{ name: string; file: string }>
  }
  tokens: Record<string, unknown>
  components: PreviewComponent[]
  patterns: PreviewPattern[]
}): string
