import { Worker } from 'node:worker_threads'
import { readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface TemplateInfo {
  /** Template name, e.g. "hero" or "buttons/primary" */
  name: string
  /** 8-char MD5 of all source files contributing to this template; '' if invalid */
  hash: string
  valid: boolean
  errors: string[]
  /** Files (relative to projectRoot) that contributed to the hash */
  files: string[]
}

const TEMPLATE_FILES = ['index.tsx', 'index.ts', 'index.jsx', 'index.js']

async function findEntry(dir: string): Promise<string | null> {
  for (const f of TEMPLATE_FILES) {
    const p = join(dir, f)
    if (existsSync(p)) return p
  }
  return null
}

/**
 * Discover all template names in a directory. Templates are subdirectories
 * with an index.{ts,tsx,jsx,js} entry. Subdirectories starting with "_" are excluded
 * (convention for shared code, see operations.md).
 *
 * Recursively descends into directories without an entry to find nested templates
 * like `buttons/primary`.
 */
async function discoverTemplates(templatesDir: string, prefix = ''): Promise<{ name: string; entry: string }[]> {
  const out: { name: string; entry: string }[] = []
  let entries: import('node:fs').Dirent[]
  try {
    entries = await readdir(templatesDir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('_')) continue
    const dir = join(templatesDir, e.name)
    const name = prefix ? `${prefix}/${e.name}` : e.name
    const entry = await findEntry(dir)
    if (entry) {
      out.push({ name, entry })
    } else {
      // No entry — recurse to find nested templates (e.g. buttons/primary)
      const nested = await discoverTemplates(dir, name)
      out.push(...nested)
    }
  }
  return out
}

let cachedWorkerPath: string | null = null
function workerPath(): string {
  if (cachedWorkerPath) return cachedWorkerPath
  const here = dirname(fileURLToPath(import.meta.url))
  // When loaded from dist/ at runtime, the worker is dist/templates-scan-worker.js.
  // When loaded from src/ via vitest/tsx, the .js sibling won't exist — fall back
  // to dist/, which is where it'll be after a build.
  const sibling = resolve(here, './templates-scan-worker.js')
  if (existsSync(sibling)) {
    cachedWorkerPath = sibling
    return cachedWorkerPath
  }
  // Source context (tests, dev): walk up to packages/gazetta and use dist/
  const distFallback = resolve(here, '../dist/templates-scan-worker.js')
  cachedWorkerPath = distFallback
  return cachedWorkerPath
}

interface WorkerOutput {
  valid: boolean
  hash: string
  errors: string[]
  files: string[]
}

function scanOne(entry: string, projectRoot: string): Promise<WorkerOutput> {
  return new Promise((resolveP, rejectP) => {
    const w = new Worker(workerPath(), { workerData: { entry, projectRoot } })
    w.once('message', (msg: WorkerOutput) => {
      w.terminate()
      resolveP(msg)
    })
    w.once('error', err => {
      w.terminate()
      rejectP(err)
    })
  })
}

/**
 * Validate and hash every template under `templatesDir`. Each template runs in
 * its own worker thread for cache isolation.
 *
 * Templates are validated by importing them via jiti and checking for a default
 * export (render function) and a `schema` export. Hashing covers the full
 * relative-import graph (including `_shared/` imports), excluding `node_modules`.
 *
 * `projectRoot` makes hashes stable across machines (paths are relative to it).
 */
export async function scanTemplates(templatesDir: string, projectRoot: string): Promise<TemplateInfo[]> {
  const templates = await discoverTemplates(templatesDir)
  return Promise.all(
    templates.map(async t => {
      try {
        const out = await scanOne(t.entry, projectRoot)
        return { name: t.name, ...out }
      } catch (err) {
        return { name: t.name, hash: '', valid: false, errors: [`worker error: ${(err as Error).message}`], files: [] }
      }
    }),
  )
}

/**
 * Re-scan a single template by name. Useful for the file watcher.
 */
export async function scanTemplate(templatesDir: string, projectRoot: string, name: string): Promise<TemplateInfo> {
  const dir = join(templatesDir, name)
  const entry = await findEntry(dir)
  if (!entry) {
    return { name, hash: '', valid: false, errors: ['no index.{ts,tsx,jsx,js} found'], files: [] }
  }
  try {
    const out = await scanOne(entry, projectRoot)
    return { name, ...out }
  } catch (err) {
    return { name, hash: '', valid: false, errors: [`worker error: ${(err as Error).message}`], files: [] }
  }
}

/**
 * Build a `Map<templateName, hash>` from scan results, excluding invalid templates
 * (which have hash = ''). Used by `hashManifest` and consumers.
 */
export function templateHashesFrom(infos: TemplateInfo[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const t of infos) {
    if (t.valid) m.set(t.name, t.hash)
  }
  return m
}

/**
 * Format scan errors for CLI output. Returns the number of invalid templates.
 */
export function reportTemplateErrors(infos: TemplateInfo[]): number {
  const invalid = infos.filter(t => !t.valid)
  if (!invalid.length) return 0
  for (const t of invalid) {
    console.error(`✗ Template "${t.name}" has errors:`)
    for (const e of t.errors) console.error(`  · ${e}`)
  }
  console.error(`\n${invalid.length} of ${infos.length} templates have errors.`)
  return invalid.length
}
