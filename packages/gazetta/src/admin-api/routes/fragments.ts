import { Hono } from 'hono'
import { join } from 'node:path'
import { loadSite } from '../../site-loader.js'
import { recordWrite } from '../../history-recorder.js'
import type { SourceContextResolver } from '../source-context.js'
import { CreateFragmentRequestSchema } from '../schemas/fragments.js'

export function fragmentRoutes(resolve: SourceContextResolver) {
  const app = new Hono()

  app.get('/api/fragments', async c => {
    const source = await resolve(c.req.query('target'))
    // Empty target → empty list. See pages.ts for rationale.
    try {
      const site = await loadSite({ contentRoot: source.contentRoot })
      const fragments = [...site.fragments.entries()].map(([name, frag]) => ({
        name,
        template: frag.template,
      }))
      return c.json(fragments)
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('No site.yaml found')) return c.json([])
      throw err
    }
  })

  app.post('/api/fragments', async c => {
    const source = await resolve(c.req.query('target'))
    const { storage, sidecarWriter } = source
    // Schema-validate the body — same rationale as pages.ts.
    const raw = await c.req.json()
    const parsed = CreateFragmentRequestSchema.safeParse(raw)
    if (!parsed.success) {
      return c.json(
        {
          error: 'Invalid request body',
          issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
        },
        400,
      )
    }
    const body = parsed.data

    const fragDir = source.contentRoot.path('fragments', body.name)
    const manifestPath = join(fragDir, 'fragment.json')

    if (await storage.exists(manifestPath)) {
      return c.json({ error: `Fragment "${body.name}" already exists` }, 409)
    }

    await storage.mkdir(fragDir)
    const manifest = { template: body.template, components: [] }
    await storage.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    await sidecarWriter?.writeFor('fragment', body.name)
    return c.json({ ok: true, name: body.name })
  })

  app.get('/api/fragments/:name', async c => {
    const name = c.req.param('name')
    const source = await resolve(c.req.query('target'))
    const site = await loadSite({ contentRoot: source.contentRoot })
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

  app.put('/api/fragments/:name', async c => {
    const name = c.req.param('name')
    const source = await resolve(c.req.query('target'))
    const { storage, sidecarWriter } = source
    const site = await loadSite({ contentRoot: source.contentRoot })
    const fragment = site.fragments.get(name)
    if (!fragment) return c.json({ error: `Fragment "${name}" not found` }, 404)

    const body = await c.req.json()
    const manifest = {
      template: body.template ?? fragment.template,
      content: body.content ?? fragment.content,
      components: body.components ?? fragment.components,
    }

    const manifestPath = join(fragment.dir, 'fragment.json')
    const serialized = JSON.stringify(manifest, null, 2) + '\n'

    // History first — see pages.ts PUT handler rationale (baseline must
    // capture pre-write state).
    if (source.history) {
      await recordWrite({
        history: source.history,
        contentRoot: source.contentRoot,
        operation: 'save',
        items: [{ path: source.contentRoot.relative(manifestPath), content: serialized }],
      })
    }
    await storage.writeFile(manifestPath, serialized)
    await sidecarWriter?.writeFor('fragment', name)
    return c.json({ ok: true })
  })

  app.delete('/api/fragments/:name', async c => {
    const name = c.req.param('name')
    const source = await resolve(c.req.query('target'))
    const { storage } = source
    const site = await loadSite({ contentRoot: source.contentRoot })
    const fragment = site.fragments.get(name)
    if (!fragment) return c.json({ error: `Fragment "${name}" not found` }, 404)

    const manifestPath = join(fragment.dir, 'fragment.json')
    if (source.history) {
      await recordWrite({
        history: source.history,
        contentRoot: source.contentRoot,
        operation: 'save',
        items: [{ path: source.contentRoot.relative(manifestPath), content: null }],
      })
    }
    await storage.rm(fragment.dir)
    return c.json({ ok: true })
  })

  return app
}
