import { Hono } from 'hono'
import { join } from 'node:path'
import { z } from 'zod'
import type { StorageProvider } from '../../types.js'
import { loadTemplate, hasEditorFile } from '../../template-loader.js'

const EDITOR_EXTENSIONS = ['.tsx', '.ts']

export function templateRoutes(siteDir: string, storage: StorageProvider, templatesDir?: string, adminDir?: string) {
  const app = new Hono()
  const tplDir = templatesDir ?? join(siteDir, 'templates')
  const admDir = adminDir ?? join(siteDir, 'admin')
  const editorsDir = join(admDir, 'editors')
  const fieldsDir = join(admDir, 'fields')
  const fieldsBaseUrl = `/admin/@fs/${fieldsDir}`

  app.get('/api/templates', async (c) => {
    if (!await storage.exists(tplDir)) return c.json([])

    const entries = await storage.readDir(tplDir)
    const templates = entries.filter(e => e.isDirectory).map(e => ({ name: e.name }))
    return c.json(templates)
  })

  app.get('/api/templates/:name/schema', async (c) => {
    const name = c.req.param('name')

    try {
      const loaded = await loadTemplate(storage, tplDir, name)
      const jsonSchema = z.toJSONSchema(loaded.schema as z.ZodType)
      const hasEditor = await hasEditorFile(storage, editorsDir, name)

      // Resolve editor URL for Vite /@fs/ serving
      let editorUrl: string | undefined
      if (hasEditor) {
        for (const ext of EDITOR_EXTENSIONS) {
          const filePath = join(editorsDir, `${name}${ext}`)
          if (await storage.exists(filePath)) {
            editorUrl = `/admin/@fs/${filePath}`
            break
          }
        }
      }

      return c.json({ ...jsonSchema as Record<string, unknown>, hasEditor, editorUrl, fieldsBaseUrl })
    } catch (err) {
      return c.json({ error: `Failed to load schema for template "${name}": ${(err as Error).message}` }, 500)
    }
  })

  return app
}
