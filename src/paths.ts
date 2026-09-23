import path from "node:path"

export const DESIGN_SYSTEM_DIR = "design-system"

export function resolveInside(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) throw new Error(`Absolute paths are not allowed: ${relativePath}`)
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(resolvedRoot, relativePath)
  const relative = path.relative(resolvedRoot, resolved)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Path escapes the project directory: ${relativePath}`)
  }
  return resolved
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item"
}
