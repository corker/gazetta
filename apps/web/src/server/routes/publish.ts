import { Hono } from 'hono'
import type { StorageProvider } from '@gazetta/shared'
import { loadSite } from '@gazetta/renderer'
import { publishItems, resolveDependencies, type PublishResult } from '../publish.js'

export function publishRoutes(
  siteDir: string,
  sourceStorage: StorageProvider,
  targets: Map<string, StorageProvider>
) {
  const app = new Hono()

  // List available targets
  app.get('/api/targets', (_c) => {
    return _c.json([...targets.keys()])
  })

  // Publish items to targets
  app.post('/api/publish', async (c) => {
    const body = await c.req.json() as { items: string[]; targets: string[] }
    if (!body.items?.length) return c.json({ error: 'No items specified' }, 400)
    if (!body.targets?.length) return c.json({ error: 'No targets specified' }, 400)

    // Validate target names
    for (const name of body.targets) {
      if (!targets.has(name)) return c.json({ error: `Unknown target: ${name}` }, 400)
    }

    // Resolve dependencies (templates, fragments)
    const allItems = await resolveDependencies(sourceStorage, siteDir, body.items)
    console.log(`  Publishing ${allItems.length} items to ${body.targets.length} target(s):`)
    console.log(`    Items: ${allItems.join(', ')}`)
    console.log(`    Targets: ${body.targets.join(', ')}`)

    // Publish to each target (best-effort)
    const results: PublishResult[] = []
    for (const targetName of body.targets) {
      const targetStorage = targets.get(targetName)!
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

  return app
}
