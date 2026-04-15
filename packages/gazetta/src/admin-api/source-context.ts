/**
 * SourceContext — everything an admin-api route needs to read or write
 * source content. Bundles storage, site directory, content root, and the
 * sidecar writer into one parameter so route factories depend on a single
 * coherent concept instead of 3-4 positional arguments.
 *
 * This is the admin-api's "source" indirection. Today it wraps the ambient
 * source storage + siteDir pair; tomorrow it can be built from a
 * TargetRegistry's selected editable target with no changes to routes.
 */

import type { StorageProvider } from '../types.js'
import { createContentRoot, type ContentRoot } from '../content-root.js'
import type { SourceSidecarWriter } from '../source-sidecars.js'

export interface SourceContext {
  /** Storage provider for source reads and writes. */
  readonly storage: StorageProvider
  /**
   * Site directory path prefix — the path under `storage` where content lives.
   * Empty string when storage is already rooted at the content root (target-rooted).
   */
  readonly siteDir: string
  /** Content root (storage + siteDir paired for path construction). */
  readonly contentRoot: ContentRoot
  /** Optional sidecar writer for write-through hash/dependency tracking. */
  readonly sidecarWriter?: SourceSidecarWriter
}

export interface CreateSourceContextOptions {
  storage: StorageProvider
  siteDir: string
  sidecarWriter?: SourceSidecarWriter
}

export function createSourceContext(opts: CreateSourceContextOptions): SourceContext {
  return {
    storage: opts.storage,
    siteDir: opts.siteDir,
    contentRoot: createContentRoot(opts.storage, opts.siteDir),
    sidecarWriter: opts.sidecarWriter,
  }
}
