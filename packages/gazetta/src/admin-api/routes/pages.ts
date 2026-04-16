import { Hono } from 'hono'
import { join } from 'node:path'
import { loadSite } from '../../site-loader.js'
import type { SourceContextResolver } from '../source-context.js'

export function pageRoutes(resolve: SourceContextResolver) {
  const app = new Hono()

  app.get('/api/pages', async (c) => {
    const source = await resolve(c.req.query('target'))
    // Empty target (e.g. a publish-target that's never received any
    // content) is valid per the stateless-CMS model — return an empty
    // list rather than erroring. Callers checking item availability
    // across targets (e.g. the target-switch missing-item banner) rely
    // on this: a 404/500 would force them to choose between "fail
    // open" (wrong, reports items as present) and "fail closed" (wrong,
    // hides legitimate targets the user might want to switch to).
    try {
      const site = await loadSite({ contentRoot: source.contentRoot })
      const pages = [...site.pages.entries()].map(([name, page]) => ({
        name,
        route: page.route,
        template: page.template,
      }))
      return c.json(pages)
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('No site.yaml found')) return c.json([])
      throw err
    }
  })

  app.post('/api/pages', async (c) => {
    const source = await resolve(c.req.query('target'))
    const { storage, sidecarWriter } = source
    const body = await c.req.json() as { name: string; template: string; content?: Record<string, unknown> }
    if (!body.name || !body.template) {
      return c.json({ error: 'Missing required fields: name, template' }, 400)
    }

    const pageDir = source.contentRoot.path('pages', body.name)
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
    await sidecarWriter?.writeFor('page', body.name)
    return c.json({ ok: true, name: body.name })
  })

  app.get('/api/pages/:name{.+}', async (c) => {
    const name = c.req.param('name')
    const source = await resolve(c.req.query('target'))
    const site = await loadSite({ contentRoot: source.contentRoot })
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
    const source = await resolve(c.req.query('target'))
    const { storage, sidecarWriter } = source
    const site = await loadSite({ contentRoot: source.contentRoot })
    const page = site.pages.get(name)
    if (!page) return c.json({ error: `Page "${name}" not found` }, 404)

    const body = await c.req.json()
    const manifest = {
      template: body.template ?? page.template,
      content: body.content ?? page.content,
      components: body.components ?? page.components,
    }

    await storage.writeFile(join(page.dir, 'page.json'), JSON.stringify(manifest, null, 2) + '\n')
    await sidecarWriter?.writeFor('page', name)
    return c.json({ ok: true })
  })

  app.delete('/api/pages/:name{.+}', async (c) => {
    const name = c.req.param('name')
    const source = await resolve(c.req.query('target'))
    const { storage } = source
    const site = await loadSite({ contentRoot: source.contentRoot })
    const page = site.pages.get(name)
    if (!page) return c.json({ error: `Page "${name}" not found` }, 404)

    await storage.rm(page.dir)
    return c.json({ ok: true })
  })

  return app
}
