import { Hono } from 'hono'
import type { StorageProvider, TargetConfig } from '../../types.js'
import { publishItems, resolveDependencies } from '../../publish.js'
import type { PublishResult } from '../../publish.js'

export function publishRoutes(
  siteDir: string,
  sourceStorage: StorageProvider,
  preInitTargets?: Map<string, StorageProvider>,
  targetConfigs?: Record<string, TargetConfig>
) {
  const app = new Hono()

  // Background target initialization — starts immediately, doesn't block startup
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

  // If no pre-init targets, start background init and store result when done
  if (!preInitTargets) {
    initPromise.then(t => { targets = t }).catch(() => { targets = new Map() })
  }

  async function getTargets(): Promise<Map<string, StorageProvider>> {
    if (targets) return targets
    return initPromise
  }

  app.get('/api/targets', async (c) => {
    const t = await getTargets()
    return c.json([...t.keys()])
  })

  app.post('/api/publish', async (c) => {
    const body = await c.req.json() as { items: string[]; targets: string[] }
    if (!body.items?.length) return c.json({ error: 'No items specified' }, 400)
    if (!body.targets?.length) return c.json({ error: 'No targets specified' }, 400)

    const t = await getTargets()

    for (const name of body.targets) {
      if (!t.has(name)) return c.json({ error: `Unknown target: ${name}` }, 400)
    }

    const allItems = await resolveDependencies(sourceStorage, siteDir, body.items)
    console.log(`  Publishing ${allItems.length} items to ${body.targets.length} target(s):`)
    console.log(`    Items: ${allItems.join(', ')}`)
    console.log(`    Targets: ${body.targets.join(', ')}`)

    const results: PublishResult[] = []
    for (const targetName of body.targets) {
      const targetStorage = t.get(targetName)!
      try {
        const { copiedFiles } = await publishItems(sourceStorage, siteDir, targetStorage, '', allItems)
        results.push({ target: targetName, success: true, copiedFiles })
        console.log(`    ${targetName}: ${copiedFiles} files copied`)
      } catch (err) {
        const error = (err as Error).message
        results.push({ target: targetName, success: false, error, copiedFiles: 0 })
        console.error(`    ${targetName}: FAILED — ${error}`)
      }
    }

    const allSuccess = results.every(r => r.success)
    return c.json({ results }, allSuccess ? 200 : 207)
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
