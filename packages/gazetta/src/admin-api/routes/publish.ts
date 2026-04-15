import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { getType, getEnvironment } from '../../types.js'
import type { StorageProvider, TargetConfig } from '../../types.js'
import { publishItems, resolveDependencies, findFragmentDependents, findDependentsFromSidecars } from '../../publish.js'
import { listSidecars } from '../../sidecars.js'
import type { SourceSidecarWriter } from '../../source-sidecars.js'
import { mapLimit } from '../../concurrency.js'
import { mapLimitStream } from '../../concurrency.js'
import type { PublishResult } from '../../publish.js'
import { publishPageRendered, publishPageStatic, publishFragmentRendered, publishSiteManifest, publishFragmentIndex, createCloudflarePurge, lookupCloudflareZoneId } from '../../publish-rendered.js'
import { loadSite } from '../../site-loader.js'
import { resolveEnvVars } from '../../targets.js'
import { scanTemplates, templateHashesFrom, type TemplateInfo } from '../../templates-scan.js'
import { hashManifest } from '../../hash.js'

/**
 * Progress events streamed by runPublish. Consumed both by the SSE route
 * (forwarded to the client as event-stream messages) and the legacy
 * synchronous route (which only takes the final 'done').
 */
export type PublishProgress =
  | { kind: 'start'; targets: string[]; itemsPerTarget: number }
  | { kind: 'target-start'; target: string; total: number }
  | { kind: 'progress'; target: string; current: number; total: number; label: string }
  | { kind: 'target-result'; result: PublishResult }
  | { kind: 'done'; results: PublishResult[] }
  | { kind: 'fatal'; error: string; invalidTemplates?: { name: string; errors: string[] }[] }

export function publishRoutes(
  siteDir: string,
  sourceStorage: StorageProvider,
  preInitTargets?: Map<string, StorageProvider>,
  targetConfigs?: Record<string, TargetConfig>,
  templatesDir?: string,
  // Optional injected scanner — the admin-api server memoizes it and
  // clears the cache via its template file watcher. Default: fresh scan
  // on every call (used by the CLI and tests).
  scanTemplatesInjected?: (templatesDir: string, projectRoot: string) => Promise<TemplateInfo[]>,
  sidecarWriter?: SourceSidecarWriter,
) {
  const scan = scanTemplatesInjected ?? scanTemplates
  const app = new Hono()

  // Background target initialization
  let targets: Map<string, StorageProvider> | null = preInitTargets ?? null
  const initPromise: Promise<Map<string, StorageProvider>> = preInitTargets
    ? Promise.resolve(preInitTargets)
    : (!targetConfigs || Object.keys(targetConfigs).length === 0)
      ? Promise.resolve(new Map())
      : (async () => {
          const { createTargetRegistry } = await import('../../targets.js')
          targets = await createTargetRegistry(targetConfigs, siteDir)
          return targets
        })()

  if (!preInitTargets) {
    initPromise.then(t => { targets = t }).catch(() => { targets = new Map() })
  }

  async function getTargets(): Promise<Map<string, StorageProvider>> {
    if (targets) return targets
    return initPromise
  }

  function getTargetConfig(name: string): TargetConfig | undefined {
    return targetConfigs?.[name]
  }

  app.get('/api/targets', async (c) => {
    const t = await getTargets()
    return c.json([...t.keys()].map(name => {
      const cfg = getTargetConfig(name)
      return {
        name,
        environment: cfg ? getEnvironment(cfg) : 'local',
        type: cfg ? getType(cfg) : 'static',
      }
    }))
  })

  /**
   * Reverse-dependency lookup for publish UI impact preview.
   * GET /api/dependents?item=fragments/header[&target=staging]
   *   → { pages: string[], fragments: string[] }
   *
   * Without `target`: scans local source manifests (authoritative for the
   * current draft state — what's about to be published). Slow-ish on very
   * large sites since it reads every manifest.
   *
   * With `target`: uses published .uses-* / .tpl-* sidecars on that target.
   * Listings only, no content reads — scales to 10k+ items at the cost of
   * reflecting only what's been published (not unsaved local changes).
   * Useful for answering "what pages would need republish if this fragment
   * changed" on large sites.
   */
  app.get('/api/dependents', async (c) => {
    const item = c.req.query('item')
    if (!item || !item.startsWith('fragments/')) {
      return c.json({ error: 'Missing or invalid "item" query (must be fragments/<name>)' }, 400)
    }
    const fragmentName = item.slice('fragments/'.length)
    const targetName = c.req.query('target')
    try {
      if (targetName) {
        const t = await getTargets()
        const targetStorage = t.get(targetName)
        if (!targetStorage) return c.json({ error: `Unknown target: ${targetName}` }, 400)
        const result = await findDependentsFromSidecars(targetStorage, { fragment: fragmentName })
        return c.json(result)
      }
      // Source-side: use sidecars for the listing-only fast path. Backfill
      // any missing ones first so the answer is complete — without this,
      // items whose sidecars haven't been written yet (fresh dev server,
      // items never saved through the admin) would be invisible.
      if (sidecarWriter) {
        const site = await loadSite({ siteDir, storage: sourceStorage, templatesDir })
        const [pagesList, fragmentsList] = await Promise.all([
          listSidecars(sourceStorage, `${siteDir}/pages`),
          listSidecars(sourceStorage, `${siteDir}/fragments`),
        ])
        const missingPages = [...site.pages.keys()].filter(n => !pagesList.has(n))
        const missingFragments = [...site.fragments.keys()].filter(n => !fragmentsList.has(n))
        if (missingPages.length || missingFragments.length) {
          await mapLimit([
            ...missingPages.map(n => ({ kind: 'page' as const, name: n })),
            ...missingFragments.map(n => ({ kind: 'fragment' as const, name: n })),
          ], it => sidecarWriter.writeFor(it.kind, it.name))
        }
        const result = await findDependentsFromSidecars(sourceStorage, { fragment: fragmentName }, { baseDir: siteDir })
        return c.json(result)
      }
      // No writer injected (legacy setup) — fall back to the manifest walker.
      const result = await findFragmentDependents(sourceStorage, siteDir, fragmentName)
      return c.json(result)
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500)
    }
  })

  /**
   * Run a publish, yielding progress events. Both the synchronous
   * /api/publish route and the streaming /api/publish/stream route consume
   * this generator. Caller can short-circuit by returning false from the
   * iterator (or break) and we'll stop between items — but storage operations
   * already in flight will complete.
   *
   * Pre-flight validation (unknown targets, invalid templates) is reported as
   * 'fatal' before any 'target-start' event so callers can map to a 4xx.
   */
  async function* runPublish(items: string[], targetNames: string[]): AsyncGenerator<PublishProgress> {
    if (!items?.length) { yield { kind: 'fatal', error: 'No items specified' }; return }
    if (!targetNames?.length) { yield { kind: 'fatal', error: 'No targets specified' }; return }

    const t = await getTargets()
    for (const name of targetNames) {
      if (!t.has(name)) { yield { kind: 'fatal', error: `Unknown target: ${name}` }; return }
    }

    const allItems = await resolveDependencies(sourceStorage, siteDir, items)

    console.log(`  Publishing to ${targetNames.length} target(s):`)
    console.log(`    Items: ${items.join(', ')} (+ ${allItems.length - items.length} dependencies)`)
    console.log(`    Targets: ${targetNames.join(', ')}`)

    const tdir = templatesDir ?? `${siteDir}/templates`
    const projectRoot = siteDir.replace(/\/sites\/[^/]+$/, '')
    const templateInfos = await scan(tdir, projectRoot)
    const invalidTpls = templateInfos.filter(t => !t.valid)
    if (invalidTpls.length) {
      yield {
        kind: 'fatal',
        error: 'Cannot publish: invalid templates',
        invalidTemplates: invalidTpls.map(t => ({ name: t.name, errors: t.errors })),
      }
      return
    }
    const templateHashes = templateHashesFrom(templateInfos)
    const site = await loadSite({ siteDir, storage: sourceStorage, templatesDir: tdir })

    yield { kind: 'start', targets: targetNames, itemsPerTarget: allItems.length }

    const results: PublishResult[] = []
    for (const targetName of targetNames) {
      const targetStorage = t.get(targetName)!
      const config = getTargetConfig(targetName)
      const isStatic = config ? getType(config) === 'static' : true
      const purgeConfig = config?.cache?.purge

      // Static mode bakes fragments into pages at publish time — if the user
      // picked @header, we must also republish every page that uses it.
      // Expand per-target so ESI targets still get the narrow item set.
      let targetItems = allItems
      if (isStatic) {
        const fragmentItems = items.filter(i => i.startsWith('fragments/'))
        if (fragmentItems.length) {
          const expanded = new Set(allItems)
          for (const frag of fragmentItems) {
            const name = frag.replace('fragments/', '')
            const deps = await findFragmentDependents(sourceStorage, siteDir, name)
            for (const p of deps.pages) expanded.add(`pages/${p}`)
          }
          targetItems = [...expanded]
        }
      }

      // Step count: source-copy + per-item render + manifest+index + (purge?)
      const total = 1 + targetItems.length + 1 + (purgeConfig?.type === 'cloudflare' ? 1 : 0)
      yield { kind: 'target-start', target: targetName, total }

      let current = 0
      try {
        let totalFiles = 0

        // 1. Source copy
        const { copiedFiles } = await publishItems(sourceStorage, siteDir, targetStorage, '', targetItems)
        totalFiles += copiedFiles
        current++
        yield { kind: 'progress', target: targetName, current, total, label: 'source files' }

        // 2. Render items in bounded parallel. Progress events are yielded
        // in completion order — the UI shows X/N + whatever finished last,
        // which stays meaningful without needing input-order. Preserves the
        // event contract: one 'progress' per item between 'target-start'
        // and 'target-result'.
        // Static-mode page hashes must include fragment hashes (a fragment
        // change invalidates every page that bakes it in). Matches the
        // combination used by compareTargets.
        const fragmentHashes = new Map<string, string>()
        if (isStatic) {
          for (const [fragName, frag] of site.fragments) {
            fragmentHashes.set(fragName, hashManifest(frag, { templateHashes }))
          }
        }
        const pageHashOpts = isStatic ? { templateHashes, fragmentHashes } : { templateHashes }

        const renderItem = async (item: string): Promise<{ files: number }> => {
          if (item.startsWith('pages/')) {
            const pageName = item.replace('pages/', '')
            const page = site.pages.get(pageName)
            const manifestHash = page ? hashManifest(page, pageHashOpts) : undefined
            if (isStatic) {
              return publishPageStatic(pageName, sourceStorage, siteDir, targetStorage, tdir, manifestHash, site)
            }
            const { files } = await publishPageRendered(pageName, sourceStorage, siteDir, targetStorage, config?.cache, tdir, manifestHash, site)
            return { files }
          }
          if (item.startsWith('fragments/') && !isStatic) {
            const fragName = item.replace('fragments/', '')
            const frag = site.fragments.get(fragName)
            const manifestHash = frag ? hashManifest(frag, { templateHashes }) : undefined
            const { files } = await publishFragmentRendered(fragName, sourceStorage, siteDir, targetStorage, tdir, manifestHash, site)
            return { files }
          }
          return { files: 0 } // skipped (e.g. fragment on static target)
        }

        // Render concurrency is lower than listing concurrency — each render
        // may do multiple writes, so 10 in flight is the safe default.
        for await (const { item, result } of mapLimitStream(targetItems, renderItem, 10)) {
          totalFiles += result.files
          current++
          yield { kind: 'progress', target: targetName, current, total, label: item }
        }

        // 3. Site manifest + fragment index
        await publishSiteManifest(sourceStorage, siteDir, targetStorage, site)
        await publishFragmentIndex(sourceStorage, siteDir, targetStorage, site)
        totalFiles += 2
        current++
        yield { kind: 'progress', target: targetName, current, total, label: 'site manifest' }

        // 4. Purge CDN cache
        if (purgeConfig?.type === 'cloudflare') {
          const apiToken = resolveEnvVars(purgeConfig.apiToken)
          const zoneId = resolveEnvVars(purgeConfig.zoneId) ?? (config?.siteUrl && apiToken ? await lookupCloudflareZoneId(config.siteUrl, apiToken) : null)
          if (apiToken && zoneId) {
            const purge = createCloudflarePurge(zoneId, apiToken)
            const hasFragments = targetItems.some(i => i.startsWith('fragments/'))
            if (hasFragments) {
              await purge.purgeAll()
              console.log(`    ${targetName}: cache purged (all)`)
            } else if (config?.siteUrl) {
              const siteForUrls = await loadSite({ siteDir, storage: sourceStorage, templatesDir })
              const urls = targetItems
                .filter(i => i.startsWith('pages/'))
                .map(i => {
                  const page = siteForUrls.pages.get(i.replace('pages/', ''))
                  return page ? `${config.siteUrl}${page.route}` : null
                })
                .filter(Boolean) as string[]
              if (urls.length > 0) {
                await purge.purgeUrls(urls)
                console.log(`    ${targetName}: cache purged (${urls.join(', ')})`)
              }
            }
          }
          current++
          yield { kind: 'progress', target: targetName, current, total, label: 'cache purge' }
        }

        const result: PublishResult = { target: targetName, success: true, copiedFiles: totalFiles }
        results.push(result)
        console.log(`    ${targetName}: ${totalFiles} files`)
        yield { kind: 'target-result', result }
      } catch (err) {
        const error = (err as Error).message
        const result: PublishResult = { target: targetName, success: false, error, copiedFiles: 0 }
        results.push(result)
        console.error(`    ${targetName}: FAILED — ${error}`)
        yield { kind: 'target-result', result }
      }
    }

    yield { kind: 'done', results }
  }

  app.post('/api/publish', async (c) => {
    const body = await c.req.json() as { items: string[]; targets: string[] }
    let results: PublishResult[] = []
    let fatal: PublishProgress | null = null
    for await (const ev of runPublish(body.items, body.targets)) {
      if (ev.kind === 'fatal') fatal = ev
      else if (ev.kind === 'done') results = ev.results
    }
    if (fatal) {
      const status = fatal.error.startsWith('Cannot publish') ? 400 : 400
      return c.json({ error: fatal.error, ...(fatal.invalidTemplates ? { invalidTemplates: fatal.invalidTemplates } : {}) }, status)
    }
    const allSuccess = results.every(r => r.success)
    return c.json({ results }, allSuccess ? 200 : 207)
  })

  app.post('/api/publish/stream', async (c) => {
    const body = await c.req.json() as { items: string[]; targets: string[] }
    return streamSSE(c, async (stream) => {
      try {
        for await (const ev of runPublish(body.items, body.targets)) {
          if (stream.aborted) return
          await stream.writeSSE({ event: ev.kind, data: JSON.stringify(ev) })
        }
      } catch (err) {
        if (!stream.aborted) {
          await stream.writeSSE({ event: 'fatal', data: JSON.stringify({ kind: 'fatal', error: (err as Error).message }) })
        }
      }
    })
  })

  app.post('/api/fetch', async (c) => {
    const body = await c.req.json() as { source: string; items?: string[] }
    if (!body.source) return c.json({ error: 'Missing "source" target name' }, 400)

    const t = await getTargets()
    const targetStorage = t.get(body.source)
    if (!targetStorage) return c.json({ error: `Unknown target: ${body.source}` }, 400)

    let items: string[]
    if (body.items?.length) {
      items = body.items
    } else {
      items = []
      try {
        if (await targetStorage.exists('pages')) {
          const pages = await targetStorage.readDir('pages')
          for (const p of pages) {
            if (p.isDirectory) items.push(`pages/${p.name}`)
          }
        }
        if (await targetStorage.exists('fragments')) {
          const frags = await targetStorage.readDir('fragments')
          for (const f of frags) {
            if (f.isDirectory) items.push(`fragments/${f.name}`)
          }
        }
        if (await targetStorage.exists('templates')) {
          const tmpls = await targetStorage.readDir('templates')
          for (const t of tmpls) {
            if (t.isDirectory) items.push(`templates/${t.name}`)
          }
        }
      } catch (err) {
        return c.json({ error: `Failed to list target contents: ${(err as Error).message}` }, 500)
      }
    }

    if (items.length === 0) return c.json({ error: 'No content found on target' }, 404)

    console.log(`  Fetching ${items.length} items from "${body.source}":`)
    console.log(`    Items: ${items.join(', ')}`)

    try {
      const { copiedFiles } = await publishItems(targetStorage, '', sourceStorage, siteDir, items)
      console.log(`    ${copiedFiles} files copied to working copy`)
      return c.json({ success: true, copiedFiles, items })
    } catch (err) {
      const error = (err as Error).message
      console.error(`    FAILED — ${error}`)
      return c.json({ error }, 500)
    }
  })

  return app
}
