import { Hono } from 'hono'
import { join } from 'node:path'
import yaml from 'js-yaml'
import type { StorageProvider } from '@gazetta/shared'
import { loadSite } from '@gazetta/renderer'

export function pageRoutes(siteDir: string, storage: StorageProvider) {
  const app = new Hono()

  app.get('/api/pages', async (c) => {
    const site = await loadSite(siteDir, storage)
    const pages = [...site.pages.entries()].map(([name, page]) => ({
      name,
      route: page.route,
      template: page.template,
      metadata: page.metadata,
    }))
    return c.json(pages)
  })

  // Create a new page
  app.post('/api/pages', async (c) => {
    const body = await c.req.json() as { name: string; route: string; template: string; metadata?: Record<string, unknown> }
    if (!body.name || !body.route || !body.template) {
      return c.json({ error: 'Missing required fields: name, route, template' }, 400)
    }

    const pageDir = join(join(siteDir, 'pages'), body.name)
    const manifestPath = join(pageDir, 'page.yaml')

    if (await storage.exists(manifestPath)) {
      return c.json({ error: `Page "${body.name}" already exists` }, 409)
    }

    await storage.mkdir(pageDir)
    const manifest = {
      route: body.route,
      template: body.template,
      metadata: body.metadata ?? { title: body.name },
      components: [],
    }
    const yamlContent = yaml.dump(manifest, { quotingType: '"', forceQuotes: false })
    await storage.writeFile(manifestPath, yamlContent)
    return c.json({ ok: true, name: body.name })
  })

  app.get('/api/pages/:name{.+}', async (c) => {
    const name = c.req.param('name')
    const site = await loadSite(siteDir, storage)
    const page = site.pages.get(name)
    if (!page) return c.json({ error: `Page "${name}" not found` }, 404)
    return c.json({
      name,
      route: page.route,
      template: page.template,
      metadata: page.metadata,
      content: page.content,
      components: page.components,
      dir: page.dir,
    })
  })

  app.put('/api/pages/:name{.+}', async (c) => {
    const name = c.req.param('name')
    const site = await loadSite(siteDir, storage)
    const page = site.pages.get(name)
    if (!page) return c.json({ error: `Page "${name}" not found` }, 404)

    const body = await c.req.json()
    const manifest = {
      route: body.route ?? page.route,
      template: body.template ?? page.template,
      metadata: body.metadata ?? page.metadata,
      content: body.content ?? page.content,
      components: body.components ?? page.components,
    }

    const yamlContent = yaml.dump(manifest, { quotingType: '"', forceQuotes: false })
    await storage.writeFile(join(page.dir, 'page.yaml'), yamlContent)
    return c.json({ ok: true })
  })

  app.delete('/api/pages/:name{.+}', async (c) => {
    const name = c.req.param('name')
    const site = await loadSite(siteDir, storage)
    const page = site.pages.get(name)
    if (!page) return c.json({ error: `Page "${name}" not found` }, 404)

    await storage.rm(page.dir)
    return c.json({ ok: true })
  })

  return app
}
