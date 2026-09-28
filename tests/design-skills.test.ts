import path from "node:path"
import { describe, expect, it } from "vitest"
import { designSkillDefinitions, designSkillDirective, loadDesignSkills } from "../src/design-skills.js"

const pluginRoot = path.resolve(import.meta.dirname, "..")

describe("built-in design skills", () => {
  it("loads all coordinated skills with their OpenCode IDs and usable bodies", async () => {
    const skills = await loadDesignSkills(pluginRoot, {})

    expect(skills.map((skill) => skill.id)).toEqual(designSkillDefinitions.map((skill) => skill.id))
    expect(skills.every((skill) => path.isAbsolute(skill.path))).toBe(true)
    expect(skills.every((skill) => !skill.content.startsWith("---"))).toBe(true)
    expect(skills[0]!.content).toContain("decorative glows, halos, or pulsing dots")
    expect(skills[1]!.content).toContain("Do not introduce a parallel `.interface-design/system.md`")
    expect(skills[2]!.content).toContain("Focus Appearance is **Level AAA**")

    const directive = designSkillDirective(skills)
    expect(directive).toContain("opencode-design-visual-direction")
    expect(directive).toContain("opencode-design-token-accessibility")
    expect(directive).toContain("Coordinate them rather than treating them as competing styles")
  })

  it("allows disabling or allow-listing bundled skills through plugin options", async () => {
    const disabled = await loadDesignSkills(pluginRoot, {
      designSkills: { "opencode-design-visual-direction": false },
    })
    expect(disabled.map((skill) => skill.id)).not.toContain("opencode-design-visual-direction")
    expect(disabled).toHaveLength(2)

    const allowListed = await loadDesignSkills(pluginRoot, {
      designSkills: ["opencode-design-token-accessibility"],
    })
    expect(allowListed.map((skill) => skill.id)).toEqual(["opencode-design-token-accessibility"])

    expect(await loadDesignSkills(pluginRoot, { designSkills: false })).toEqual([])
  })
})
