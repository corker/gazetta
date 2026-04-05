import { Hono } from 'hono'
import { join } from 'node:path'
import yaml from 'js-yaml'
import type { StorageProvider } from '@gazetta/shared'
import { loadSite } from '@gazetta/renderer'

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

    const yamlContent = yaml.dump(manifest, { quotingType: '"', forceQuotes: false })
    await storage.writeFile(join(fragment.dir, 'fragment.yaml'), yamlContent)
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
