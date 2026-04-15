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
import type { TargetRegistry } from '../targets.js'

export interface SourceContext {
  /** Storage provider for source reads and writes. */
  readonly storage: StorageProvider
  /**
   * Path prefix applied to storage operations — where content lives *under*
   * the storage provider. Empty string when storage is already rooted at
   * the content root (target-rooted), equal to `projectSiteDir` when storage
   * is cwd-rooted (legacy).
   * @deprecated Prefer `contentRoot.path(...)` for building content paths.
   */
  readonly siteDir: string
  /**
   * Absolute path to the project's site directory — where site.yaml lives,
   * and the parent of `templates/` and `admin/`. Independent of storage
   * rooting: always the on-disk project path, even when the content storage
   * is target-rooted elsewhere.
   */
  readonly projectSiteDir: string
  /** Content root (storage + rooting prefix paired for path construction). */
  readonly contentRoot: ContentRoot
  /** Optional sidecar writer for write-through hash/dependency tracking. */
  readonly sidecarWriter?: SourceSidecarWriter
}

export interface CreateSourceContextOptions {
  storage: StorageProvider
  /** Path prefix applied to storage — see SourceContext.siteDir. */
  siteDir: string
  /** Absolute project site directory. Defaults to `siteDir` for backward compat. */
  projectSiteDir?: string
  sidecarWriter?: SourceSidecarWriter
}

export function createSourceContext(opts: CreateSourceContextOptions): SourceContext {
  return {
    storage: opts.storage,
    siteDir: opts.siteDir,
    projectSiteDir: opts.projectSiteDir ?? opts.siteDir,
    contentRoot: createContentRoot(opts.storage, opts.siteDir),
    sidecarWriter: opts.sidecarWriter,
  }
}

export interface SourceContextFromRegistryOptions {
  registry: TargetRegistry
  /** Target name to use as the source. Defaults to `registry.defaultEditable()`. */
  targetName?: string
  /**
   * Path prefix applied to the target's storage. Typically `''` — most
   * registry-sourced targets are already content-rooted (filesystem provider
   * at `<siteDir>/targets/<key>`, cloud provider at a bucket).
   */
  siteDir?: string
  /**
   * Absolute project site directory — where site.yaml lives. Required.
   * This is independent of the target's storage rooting.
   */
  projectSiteDir: string
  sidecarWriter?: SourceSidecarWriter
}

/**
 * Construct a SourceContext from a TargetRegistry, picking the given target
 * (or the default editable target) as the source. Throws if no editable
 * target is configured and no explicit targetName is provided.
 */
export function createSourceContextFromRegistry(opts: SourceContextFromRegistryOptions): SourceContext {
  const name = opts.targetName ?? opts.registry.defaultEditable()
  const storage = opts.registry.get(name)
  return createSourceContext({
    storage,
    siteDir: opts.siteDir ?? '',
    projectSiteDir: opts.projectSiteDir,
    sidecarWriter: opts.sidecarWriter,
  })
}
