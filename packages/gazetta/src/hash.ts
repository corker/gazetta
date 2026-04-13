import { createHash } from 'node:crypto'
import type { ComponentEntry, FragmentManifest, PageManifest } from './types.js'

const SIDECAR_RE = /^\.([0-9a-f]{8})\.hash$/

export function sidecarNameFor(hash: string): string {
  return `.${hash}.hash`
}

export function parseSidecarName(entryName: string): string | null {
  const m = SIDECAR_RE.exec(entryName)
  return m ? m[1] : null
}

/**
 * Walk the component tree and substitute `template: "name"` with `template: "name#hash"`
 * using the provided template hashes. Returns a new normalized structure — input is not mutated.
 */
function substituteTemplateHashes(
  components: ComponentEntry[] | undefined,
  templateHashes: Map<string, string>
): ComponentEntry[] | undefined {
  if (!components) return undefined
  return components.map(entry => {
    if (typeof entry === 'string') return entry
    const hash = templateHashes.get(entry.template)
    return {
      name: entry.name,
      template: hash ? `${entry.template}#${hash}` : entry.template,
      content: entry.content,
      components: substituteTemplateHashes(entry.components, templateHashes),
    }
  })
}

export interface HashManifestOptions {
  templateHashes: Map<string, string>
}

/**
 * Compute the content hash for a page or fragment manifest.
 *
 * Substitutes template references with `name#hash` form in memory (source files
 * are not modified), serializes with stable key ordering, then MD5s.
 *
 * Result: 8 hex chars.
 */
export function hashManifest(
  manifest: PageManifest | FragmentManifest,
  opts: HashManifestOptions
): string {
  const rootHash = opts.templateHashes.get(manifest.template)
  const normalized = {
    template: rootHash ? `${manifest.template}#${rootHash}` : manifest.template,
    content: manifest.content ?? null,
    components: substituteTemplateHashes(manifest.components, opts.templateHashes) ?? null,
  }
  const json = JSON.stringify(normalized, sortedReplacer)
  return createHash('md5').update(json).digest('hex').slice(0, 8)
}

function sortedReplacer(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = (value as Record<string, unknown>)[k]
    }
    return out
  }
  return value
}
