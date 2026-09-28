import { readFile } from "node:fs/promises"
import path from "node:path"

export const designSkillDefinitions = [
  {
    id: "opencode-design-visual-direction",
    directory: "design-visual-direction",
    name: "Design visual direction",
    description: "Use when establishing or changing a product's visual direction, palette, typography, and distinctive design choices.",
  },
  {
    id: "opencode-design-interface-craft",
    directory: "design-interface-craft",
    name: "Product interface craft",
    description: "Use when designing product screens, dashboards, components, patterns, hierarchy, density, and interface states.",
  },
  {
    id: "opencode-design-token-accessibility",
    directory: "design-token-accessibility",
    name: "Accessible design tokens",
    description: "Use when selecting or changing design tokens, themes, component states, focus, motion, or screen accessibility guidance.",
  },
] as const

export interface LoadedDesignSkill {
  id: string
  name: string
  description: string
  path: string
  content: string
}

export async function loadDesignSkills(pluginRoot: string, options: unknown): Promise<LoadedDesignSkill[]> {
  const enabled = enabledSkillIDs(options)
  return Promise.all(designSkillDefinitions
    .filter((definition) => enabled.has(definition.id))
    .map(async (definition) => {
      const skillPath = path.join(pluginRoot, "skills", definition.directory, "SKILL.md")
      const markdown = await readFile(skillPath, "utf8")
      return {
        id: definition.id,
        name: definition.name,
        description: definition.description,
        path: skillPath,
        content: stripFrontmatter(markdown),
      }
    }))
}

export function designSkillDirective(skills: readonly Pick<LoadedDesignSkill, "id">[]): string {
  if (skills.length === 0) {
    return "The plugin's built-in design skills are disabled. Honor the user's direction and the project's existing Design System; use any relevant user-provided skills."
  }

  const ids = skills.map((skill) => `\`${skill.id}\``).join(", ")
  return `On Design System creation, update, preview, token, component, pattern, or screen-design tasks, load the relevant enabled plugin skills with the skill tool: ${ids}. Coordinate them rather than treating them as competing styles: establish a brief-specific visual direction first, translate it into product-interface hierarchy and reusable semantic tokens, then check the proposed token pairs, themes, states, and interactions for accessibility. The user's explicit direction and an existing project Design System remain authoritative; accessibility findings should prompt a clear explanation and a compliant alternative, not a silent visual redesign.`
}

function enabledSkillIDs(options: unknown): Set<string> {
  const all = designSkillDefinitions.map((definition) => definition.id)
  if (!options || typeof options !== "object") return new Set(all)

  const setting = (options as Record<string, unknown>).designSkills
  if (setting === false) return new Set()
  if (Array.isArray(setting)) return new Set(all.filter((id) => setting.includes(id)))
  if (!setting || typeof setting !== "object") return new Set(all)

  const configured = setting as Record<string, unknown>
  return new Set(all.filter((id) => configured[id] !== false))
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim()
}
