import { Hono } from 'hono'
import { join } from 'node:path'
import { z } from 'zod'
import type { StorageProvider } from '../../types.js'
import { loadTemplate, hasEditorFile } from '../../template-loader.js'

export function templateRoutes(siteDir: string, storage: StorageProvider) {
  const app = new Hono()
  const editorsDir = join(siteDir, 'admin', 'editors')

  app.get('/api/templates', async (c) => {
    const templatesDir = join(siteDir, 'templates')
    if (!await storage.exists(templatesDir)) return c.json([])

    const entries = await storage.readDir(templatesDir)
    const templates = entries.filter(e => e.isDirectory).map(e => ({ name: e.name }))
    return c.json(templates)
  })

  app.get('/api/templates/:name/schema', async (c) => {
    const name = c.req.param('name')
    const templatesDir = join(siteDir, 'templates')

    try {
      const loaded = await loadTemplate(storage, templatesDir, name)
      const jsonSchema = z.toJSONSchema(loaded.schema as z.ZodType)
      const hasEditor = await hasEditorFile(storage, editorsDir, name)
      return c.json({ ...jsonSchema as Record<string, unknown>, hasEditor })
    } catch (err) {
      return c.json({ error: `Failed to load schema for template "${name}": ${(err as Error).message}` }, 500)
    }
  })

  return app
}
