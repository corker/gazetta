import { Hono } from 'hono'
import { join } from 'node:path'
import { createFilesystemProvider } from '../../providers/filesystem.js'
import type { SourceContext } from '../source-context.js'

const FIELD_EXTENSIONS = ['.ts', '.tsx']

export function fieldRoutes(source: SourceContext, adminDir?: string) {
  const app = new Hono()
  // Custom fields live at project level, outside target content storage.
  const storage = createFilesystemProvider()
  const fieldsDir = join(adminDir ?? join(source.projectSiteDir, 'admin'), 'fields')

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
