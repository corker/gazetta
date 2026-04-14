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
import type { PageManifest, FragmentManifest } from './types.js'

export interface SourceSidecarWriter {
  writeFor(kind: 'page' | 'fragment', name: string): Promise<void>
  invalidate(): void
}

export interface SourceSidecarWriterOptions {
  storage: StorageProvider
  siteDir: string
  scanTemplates: () => Promise<TemplateInfo[]>
}

export function createSourceSidecarWriter(opts: SourceSidecarWriterOptions): SourceSidecarWriter {
  let templateHashes: Promise<Map<string, string>> | null = null

  const getTemplateHashes = () => {
    if (!templateHashes) templateHashes = opts.scanTemplates().then(templateHashesFrom)
    return templateHashes
  }

  return {
    async writeFor(kind, name) {
      const subdir = kind === 'page' ? 'pages' : 'fragments'
      const manifestName = kind === 'page' ? 'page.json' : 'fragment.json'
      const itemDir = join(opts.siteDir, subdir, name)
      const manifestPath = join(itemDir, manifestName)

      let manifest: PageManifest | FragmentManifest
      try {
        manifest = JSON.parse(await opts.storage.readFile(manifestPath))
      } catch {
        return
      }

      const hashes = await getTemplateHashes()
      const hash = hashManifest(manifest, { templateHashes: hashes })
      await writeSidecars(opts.storage, itemDir, {
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
