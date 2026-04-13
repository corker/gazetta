import { Hono } from 'hono'
import { join } from 'node:path'
import type { StorageProvider } from '../../types.js'
import { loadSite } from '../../site-loader.js'

export function fragmentRoutes(siteDir: string, storage: StorageProvider) {
  const app = new Hono()

  app.get('/api/fragments', async (c) => {
    const site = await loadSite(siteDir, storage)
    const fragments = [...site.fragments.entries()].map(([name, frag]) => ({
      name,
      template: frag.template,
    }))
    return c.json(fragments)
  })

  app.post('/api/fragments', async (c) => {
    const body = await c.req.json() as { name: string; template: string }
    if (!body.name || !body.template) {
      return c.json({ error: 'Missing required fields: name, template' }, 400)
    }

    const fragDir = join(join(siteDir, 'fragments'), body.name)
    const manifestPath = join(fragDir, 'fragment.json')

    if (await storage.exists(manifestPath)) {
      return c.json({ error: `Fragment "${body.name}" already exists` }, 409)
    }

    await storage.mkdir(fragDir)
    const manifest = { template: body.template, components: [] }
    await storage.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    return c.json({ ok: true, name: body.name })
  })

  app.get('/api/fragments/:name', async (c) => {
    const name = c.req.param('name')
    const site = await loadSite(siteDir, storage)
    const fragment = site.fragments.get(name)
    if (!fragment) return c.json({ error: `Fragment "${name}" not found` }, 404)
    return c.json({
      name,
      template: fragment.template,
      content: fragment.content,
      components: fragment.components,
      dir: fragment.dir,
    })
  })

  app.put('/api/fragments/:name', async (c) => {
    const name = c.req.param('name')
    const site = await loadSite(siteDir, storage)
    const fragment = site.fragments.get(name)
    if (!fragment) return c.json({ error: `Fragment "${name}" not found` }, 404)

    const body = await c.req.json()
    const manifest = {
      template: body.template ?? fragment.template,
      content: body.content ?? fragment.content,
      components: body.components ?? fragment.components,
    }

    await storage.writeFile(join(fragment.dir, 'fragment.json'), JSON.stringify(manifest, null, 2) + '\n')
    return c.json({ ok: true })
  })

  app.delete('/api/fragments/:name', async (c) => {
    const name = c.req.param('name')
    const site = await loadSite(siteDir, storage)
    const fragment = site.fragments.get(name)
    if (!fragment) return c.json({ error: `Fragment "${name}" not found` }, 404)

    await storage.rm(fragment.dir)
    return c.json({ ok: true })
  })

  return app
}
