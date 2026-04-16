/**
 * Source-side sidecar writer. Keeps `sites/<name>/pages/` and
 * `sites/<name>/fragments/` in the same filename-encoded shape as published
 * targets — .{hash}.hash,
 * .uses-{frag}, .tpl-{template} — so compare and incremental publish can
 * read them without re-hashing manifests.
 *
 * Single responsibility: given (kind, name), hash the manifest with current
 * template hashes and write its three sidecars. Nothing else.
 *
 * Template hashes are cached. A template edit flips every dependent item's
 * content hash, so the file watcher calls invalidate() — next writeFor()
 * rescans.
 */
import { join } from 'node:path'
import type { StorageProvider } from './types.js'
import type { TemplateInfo } from './templates-scan.js'
import { templateHashesFrom } from './templates-scan.js'
import { hashManifest } from './hash.js'
import { writeSidecars, collectFragmentRefs, listSidecars } from './sidecars.js'
import { createContentRoot, type ContentRoot } from './content-root.js'
import { loadSite } from './site-loader.js'
import { mapLimit } from './concurrency.js'
import type { PageManifest, FragmentManifest } from './types.js'

export interface SourceSidecarWriter {
  writeFor(kind: 'page' | 'fragment', name: string): Promise<void>
  /**
   * Ensure every page and fragment in the site has sidecars written.
   * Idempotent; concurrent callers share the same in-flight work. Use
   * this before any read path that depends on `.uses-*` / `.tpl-*`
   * sidecars being present (e.g. dependents lookup) — without it, a
   * fresh dev server serves empty results until the first publish.
   */
  ensureBackfilled(): Promise<void>
  invalidate(): void
}

export interface SourceSidecarWriterOptions {
  /** Content root for source. Preferred shape. */
  contentRoot?: ContentRoot
  /** @deprecated Prefer `contentRoot`. */
  storage?: StorageProvider
  /** @deprecated Prefer `contentRoot`. */
  siteDir?: string
  scanTemplates: () => Promise<TemplateInfo[]>
  /** Templates directory — used by `ensureBackfilled` to load the site
   *  manifest so it knows which items need sidecars. Without this,
   *  `ensureBackfilled` throws. */
  templatesDir?: string
}

export function createSourceSidecarWriter(opts: SourceSidecarWriterOptions): SourceSidecarWriter {
  const root: ContentRoot =
    opts.contentRoot ??
    (opts.storage && opts.siteDir !== undefined
      ? createContentRoot(opts.storage, opts.siteDir)
      : (() => {
          throw new Error('createSourceSidecarWriter: pass `contentRoot` (or legacy `storage` + `siteDir`)')
        })())

  let templateHashes: Promise<Map<string, string>> | null = null
  const getTemplateHashes = () => {
    if (!templateHashes) templateHashes = opts.scanTemplates().then(templateHashesFrom)
    return templateHashes
  }

  /** Shared in-flight promise for the "every item has a sidecar" state.
   *  Concurrent callers await the same work; subsequent calls after it
   *  settles are near-free (one listSidecars + set-diff). Cleared by
   *  invalidate() so a template-hash change also re-backfills. */
  let backfillPromise: Promise<void> | null = null

  async function runBackfill(): Promise<void> {
    if (!opts.templatesDir) {
      throw new Error('SourceSidecarWriter.ensureBackfilled requires `templatesDir` in options')
    }
    const site = await loadSite({ contentRoot: root, templatesDir: opts.templatesDir })
    const [pagesList, fragmentsList] = await Promise.all([
      listSidecars(root.storage, root.path('pages')),
      listSidecars(root.storage, root.path('fragments')),
    ])
    const missingPages = [...site.pages.keys()].filter(n => !pagesList.has(n))
    const missingFragments = [...site.fragments.keys()].filter(n => !fragmentsList.has(n))
    if (!missingPages.length && !missingFragments.length) return
    await mapLimit(
      [
        ...missingPages.map(n => ({ kind: 'page' as const, name: n })),
        ...missingFragments.map(n => ({ kind: 'fragment' as const, name: n })),
      ],
      it => writer.writeFor(it.kind, it.name),
    )
  }

  const writer: SourceSidecarWriter = {
    async writeFor(kind, name) {
      const subdir = kind === 'page' ? 'pages' : 'fragments'
      const manifestName = kind === 'page' ? 'page.json' : 'fragment.json'
      const itemDir = root.path(subdir, name)
      const manifestPath = join(itemDir, manifestName)

      let manifest: PageManifest | FragmentManifest
      try {
        manifest = JSON.parse(await root.storage.readFile(manifestPath))
      } catch {
        return
      }

      const hashes = await getTemplateHashes()
      const hash = hashManifest(manifest, { templateHashes: hashes })
      await writeSidecars(root.storage, itemDir, {
        hash,
        uses: collectFragmentRefs(manifest.components),
        template: manifest.template,
      })
    },
    ensureBackfilled() {
      if (!backfillPromise) {
        backfillPromise = runBackfill().catch(err => {
          // Clear on failure so the next caller retries. Otherwise one
          // transient error would poison backfill for the process lifetime.
          backfillPromise = null
          throw err
        })
      }
      return backfillPromise
    },
    invalidate() {
      templateHashes = null
      backfillPromise = null
    },
  }
  return writer
}
