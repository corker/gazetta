import { Hono } from 'hono'
import { join } from 'node:path'
import type { StorageProvider } from '../../types.js'

const FIELD_EXTENSIONS = ['.ts', '.tsx']

export function fieldRoutes(siteDir: string, storage: StorageProvider) {
  const app = new Hono()
  const fieldsDir = join(siteDir, 'admin', 'fields')

  app.get('/api/fields', async (c) => {
    if (!await storage.exists(fieldsDir)) return c.json([])

    const entries = await storage.readDir(fieldsDir)
    const fields = entries
      .filter(e => !e.isDirectory && FIELD_EXTENSIONS.some(ext => e.name.endsWith(ext)))
      .map(e => {
        const name = e.name.replace(/\.(ts|tsx)$/, '')
        return { name, path: join(fieldsDir, e.name) }
      })
    return c.json(fields)
  })

  return app
}
