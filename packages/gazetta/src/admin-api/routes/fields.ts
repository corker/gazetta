import { Hono } from 'hono'
import { join } from 'node:path'
import type { SourceContext } from '../source-context.js'

const FIELD_EXTENSIONS = ['.ts', '.tsx']

export function fieldRoutes(source: SourceContext, adminDir?: string) {
  const app = new Hono()
  const fieldsDir = join(adminDir ?? join(source.siteDir, 'admin'), 'fields')

  app.get('/api/fields', async (c) => {
    if (!await source.storage.exists(fieldsDir)) return c.json([])

    const entries = await source.storage.readDir(fieldsDir)
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
