import { createHash } from 'node:crypto'
import type { ComponentEntry, FragmentManifest, PageManifest } from './types.js'

const SIDECAR_RE = /^\.([0-9a-f]{8})\.hash$/
const USES_SIDECAR_RE = /^\.uses-(.+)$/
const TPL_SIDECAR_RE = /^\.tpl-(.+)$/

export function sidecarNameFor(hash: string): string {
  return `.${hash}.hash`
}

export function parseSidecarName(entryName: string): string | null {
  const m = SIDECAR_RE.exec(entryName)
  return m ? m[1] : null
}

/**
 * Filename-safe encoding for fragment/template names. Fragments can be
 * subfolder-qualified (e.g. "buttons/primary"); we replace / with __ so the
 * name works as a filename component and stays readable in listings.
 */
export function encodeRefName(name: string): string {
  return name.replace(/\//g, '__')
}
export function decodeRefName(name: string): string {
  return name.replace(/__/g, '/')
}

/** `.uses-header` for a page/fragment that references @header. */
export function usesSidecarNameFor(fragmentName: string): string {
  return `.uses-${encodeRefName(fragmentName)}`
}
export function parseUsesSidecarName(entryName: string): string | null {
  const m = USES_SIDECAR_RE.exec(entryName)
  return m ? decodeRefName(m[1]) : null
}

/** `.tpl-page-default` for a page/fragment rendered with that template. */
export function templateSidecarNameFor(templateName: string): string {
  return `.tpl-${encodeRefName(templateName)}`
}
export function parseTemplateSidecarName(entryName: string): string | null {
  const m = TPL_SIDECAR_RE.exec(entryName)
  return m ? decodeRefName(m[1]) : null
}

/**
 * Walk the component tree and substitute template/fragment refs with their
 * hashed forms (`"name#hash"`) using the provided maps. Returns a new
 * normalized structure — input is not mutated.
 *
 * `fragmentHashes` is only provided for static-mode targets where fragments
 * are baked into pages at publish time — a fragment content change must
 * invalidate every page that uses it. In ESI mode fragments are published
 * separately, so pages don't need fragment hashes in their own hash.
 */
function substituteHashes(
  components: ComponentEntry[] | undefined,
  templateHashes: Map<string, string>,
  fragmentHashes?: Map<string, string>,
): ComponentEntry[] | undefined {
  if (!components) return undefined
  return components.map(entry => {
    if (typeof entry === 'string') {
      if (!fragmentHashes || !entry.startsWith('@')) return entry
      const name = entry.slice(1)
      const h = fragmentHashes.get(name)
      return h ? `@${name}#${h}` : entry
    }
    const hash = templateHashes.get(entry.template)
    return {
      name: entry.name,
      template: hash ? `${entry.template}#${hash}` : entry.template,
      content: entry.content,
      components: substituteHashes(entry.components, templateHashes, fragmentHashes),
    }
  })
}

export interface HashManifestOptions {
  templateHashes: Map<string, string>
  /** Fragment content hashes — include only for static-mode page hashing. */
  fragmentHashes?: Map<string, string>
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
    components: substituteHashes(manifest.components, opts.templateHashes, opts.fragmentHashes) ?? null,
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
