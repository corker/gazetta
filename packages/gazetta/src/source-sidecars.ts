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
import { writeSidecars, collectFragmentRefs } from './sidecars.js'
import { createContentRoot, type ContentRoot } from './content-root.js'
import type { PageManifest, FragmentManifest } from './types.js'

export interface SourceSidecarWriter {
  writeFor(kind: 'page' | 'fragment', name: string): Promise<void>
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
}

export function createSourceSidecarWriter(opts: SourceSidecarWriterOptions): SourceSidecarWriter {
  const root: ContentRoot = opts.contentRoot
    ?? (opts.storage && opts.siteDir !== undefined
      ? createContentRoot(opts.storage, opts.siteDir)
      : (() => { throw new Error('createSourceSidecarWriter: pass `contentRoot` (or legacy `storage` + `siteDir`)') })())

  let templateHashes: Promise<Map<string, string>> | null = null
  const getTemplateHashes = () => {
    if (!templateHashes) templateHashes = opts.scanTemplates().then(templateHashesFrom)
    return templateHashes
  }

  return {
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
    invalidate() {
      templateHashes = null
    },
  }
}
