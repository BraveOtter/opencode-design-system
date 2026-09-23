import { atomicWrite } from "./io.js"
import { DESIGN_SYSTEM_DIR, slugify } from "./paths.js"
import { fileExists } from "./io.js"

export async function saveScreenSpec(root: string, name: string, specification: string): Promise<{ file: string; updated: boolean; hasDesignSystem: boolean }> {
  if (!name.trim()) throw new Error("screen name is required")
  if (!specification.trim()) throw new Error("screen specification is required")
  if (specification.length > 60_000) throw new Error("screen specification exceeds 60 KB")
  const file = `${DESIGN_SYSTEM_DIR}/screens/${slugify(name)}.md`
  const updated = await fileExists(root, file)
  await atomicWrite(root, file, `# ${name.trim()}\n\n${specification.trim()}\n`)
  return { file, updated, hasDesignSystem: await fileExists(root, `${DESIGN_SYSTEM_DIR}/manifest.json`) }
}
