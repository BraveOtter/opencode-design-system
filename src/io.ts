import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { resolveInside } from "./paths.js"

export async function readText(root: string, relativePath: string): Promise<string> {
  return readFile(resolveInside(root, relativePath), "utf8")
}

export async function readJson<T>(root: string, relativePath: string): Promise<T> {
  return JSON.parse(await readText(root, relativePath)) as T
}

export async function fileExists(root: string, relativePath: string): Promise<boolean> {
  try {
    await readFile(resolveInside(root, relativePath))
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}

export async function atomicWrite(root: string, relativePath: string, content: string): Promise<void> {
  const destination = resolveInside(root, relativePath)
  const directory = path.dirname(destination)
  await mkdir(directory, { recursive: true })
  const temporary = path.join(directory, `.${path.basename(destination)}.${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, content, "utf8")
    await rename(temporary, destination)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }
}

export async function writeIfAbsent(root: string, relativePath: string, content: string): Promise<boolean> {
  const destination = resolveInside(root, relativePath)
  await mkdir(path.dirname(destination), { recursive: true })
  try {
    await writeFile(destination, content, { encoding: "utf8", flag: "wx" })
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false
    throw error
  }
}

export async function updateManagedBlock(
  root: string,
  relativePath: string,
  startMarker: string,
  endMarker: string,
  block: string,
): Promise<void> {
  let current = ""
  try {
    current = await readText(root, relativePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  const start = current.indexOf(startMarker)
  const end = current.indexOf(endMarker)
  let next: string
  if (start >= 0 && end >= start) {
    next = `${current.slice(0, start)}${block}${current.slice(end + endMarker.length)}`
  } else {
    const separator = current.length === 0 || current.endsWith("\n") ? "" : "\n"
    next = `${current}${separator}${current.length ? "\n" : ""}${block}\n`
  }
  await atomicWrite(root, relativePath, next)
}
