import { Hono } from 'hono'
import yaml from 'js-yaml'
import type { StorageProvider } from 'gazetta'

export function componentRoutes(siteDir: string, storage: StorageProvider) {
  const app = new Hono()

  app.get('/api/components', async (c) => {
    const path = c.req.query('path')
    if (!path) return c.json({ error: 'Missing "path" query parameter' }, 400)

    const manifestPath = `${path}/component.yaml`
    if (!await storage.exists(manifestPath)) {
      return c.json({ error: `Component not found at ${path}` }, 404)
    }

    const content = await storage.readFile(manifestPath)
    const manifest = yaml.load(content) as Record<string, unknown>
    return c.json({ path, ...manifest })
  })

  // Create a new component
  app.post('/api/components', async (c) => {
    const body = await c.req.json() as { parentDir: string; name: string; template: string }
    if (!body.parentDir || !body.name || !body.template) {
      return c.json({ error: 'Missing required fields: parentDir, name, template' }, 400)
    }

    const componentDir = `${body.parentDir}/${body.name}`
    const manifestPath = `${componentDir}/component.yaml`

    if (await storage.exists(manifestPath)) {
      return c.json({ error: `Component "${body.name}" already exists at ${componentDir}` }, 409)
    }

    await storage.mkdir(componentDir)
    const manifest = { template: body.template, content: {} }
    await storage.writeFile(manifestPath, yaml.dump(manifest, { quotingType: '"', forceQuotes: false }))

    return c.json({ ok: true, path: componentDir })
  })

  app.put('/api/components', async (c) => {
    const path = c.req.query('path')
    if (!path) return c.json({ error: 'Missing "path" query parameter' }, 400)

    const manifestPath = `${path}/component.yaml`
    if (!await storage.exists(manifestPath)) {
      return c.json({ error: `Component not found at ${path}` }, 404)
    }

    const body = await c.req.json()
    const existing = yaml.load(await storage.readFile(manifestPath)) as Record<string, unknown>
    const updated = { ...existing, content: body.content ?? existing.content }

    const yamlContent = yaml.dump(updated, { quotingType: '"', forceQuotes: false })
    await storage.writeFile(manifestPath, yamlContent)
    return c.json({ ok: true })
  })

  return app
}
