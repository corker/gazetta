import { Hono } from 'hono'
import { join } from 'node:path'
import type { StorageProvider } from '../../types.js'
import { loadSite } from '../../site-loader.js'

export function pageRoutes(siteDir: string, storage: StorageProvider) {
  const app = new Hono()

  app.get('/api/pages', async (c) => {
    const site = await loadSite(siteDir, storage)
    const pages = [...site.pages.entries()].map(([name, page]) => ({
      name,
      route: page.route,
      template: page.template,
    }))
    return c.json(pages)
  })

  app.post('/api/pages', async (c) => {
    const body = await c.req.json() as { name: string; template: string; content?: Record<string, unknown> }
    if (!body.name || !body.template) {
      return c.json({ error: 'Missing required fields: name, template' }, 400)
    }

    const pageDir = join(join(siteDir, 'pages'), body.name)
    const manifestPath = join(pageDir, 'page.json')

    if (await storage.exists(manifestPath)) {
      return c.json({ error: `Page "${body.name}" already exists` }, 409)
    }

    await storage.mkdir(pageDir)
    const manifest = {
      template: body.template,
      content: body.content ?? { title: body.name },
      components: [],
    }
    await storage.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
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
      template: body.template ?? page.template,
      content: body.content ?? page.content,
      components: body.components ?? page.components,
    }

    await storage.writeFile(join(page.dir, 'page.json'), JSON.stringify(manifest, null, 2) + '\n')
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
