import { Hono } from 'hono'
import { join } from 'node:path'
import type { StorageProvider, TargetConfig } from '../../types.js'
import { compareTargets } from '../../compare.js'

export function compareRoutes(
  siteDir: string,
  sourceStorage: StorageProvider,
  preInitTargets?: Map<string, StorageProvider>,
  targetConfigs?: Record<string, TargetConfig>,
  templatesDir?: string
) {
  const app = new Hono()

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

  app.get('/api/compare', async (c) => {
    const targetName = c.req.query('target')
    if (!targetName) return c.json({ error: 'Missing "target" query parameter' }, 400)

    const t = await getTargets()
    const targetStorage = t.get(targetName)
    if (!targetStorage) return c.json({ error: `Unknown target: ${targetName}` }, 400)

    const tdir = templatesDir ?? join(siteDir, 'templates')
    // Walk up from siteDir to find the project root (parent of "sites/")
    const projectRoot = siteDir.replace(/[\\/]sites[\\/][^\\/]+$/, '')

    try {
      const result = await compareTargets({
        source: sourceStorage,
        target: targetStorage,
        siteDir,
        templatesDir: tdir,
        projectRoot,
      })
      return c.json(result)
    } catch (err) {
      return c.json({ error: `Compare failed: ${(err as Error).message}` }, 500)
    }
  })

  return app
}
