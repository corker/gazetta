import { Hono, type Context } from 'hono'
import type { ResolvedComponent } from '../../types.js'
import { allPageEntries } from '../../site-loader.js'
import { loadSiteFromSource } from '../source-context.js'
import { resolveFragment, resolvePage } from '../../resolver.js'
import { renderFragment, renderPage } from '../../renderer.js'
import type { SourceContext, SourceContextResolver } from '../source-context.js'

export function previewRoutes(resolve: SourceContextResolver, templatesDir?: string) {
  const app = new Hono()

  // No caching — preview always serves fresh content for editing
  app.use('/preview/*', async (c, next) => {
    await next()
    c.header('Cache-Control', 'no-store')
  })

  app.get('/preview/*', async c => {
    const source = await resolve(c.req.query('target'))
    return renderPreview(c, source, undefined, templatesDir)
  })

  app.post('/preview/*', async c => {
    const source = await resolve(c.req.query('target'))
    const body = (await c.req.json()) as { overrides?: Record<string, Record<string, unknown>> }
    return renderPreview(c, source, body.overrides, templatesDir)
  })

  return app
}

async function renderPreview(
  c: Context,
  source: SourceContext,
  overrides?: Record<string, Record<string, unknown>>,
  templatesDir?: string,
) {
  // Empty target (no site.yaml) — preview returns a friendly placeholder
  // so the admin can still show the iframe. Happens when the active
  // target is a never-published publish-target.
  let site: Awaited<ReturnType<typeof loadSiteFromSource>>
  try {
    site = await loadSiteFromSource(source, { templatesDir })
  } catch (err) {
    if ((err as Error).message.includes('No site.yaml found')) {
      return c.html(
        '<!doctype html><html><body style="font-family:system-ui;padding:2rem;color:#525252">' +
          '<h2 style="margin:0 0 0.5rem">No content on this target yet</h2>' +
          '<p style="margin:0;font-size:0.875rem">Publish from an editable target to see a preview here.</p>' +
          '</body></html>',
        404,
      )
    }
    throw err
  }
  const requestPath = c.req.path.replace(/^.*\/preview/, '') || '/'

  // Fragment preview: /preview/@fragmentName or /preview/fr/@fragmentName
  // Extract locale prefix if present before the @
  let previewLocale: string | undefined
  let fragRequestPath = requestPath
  const localeFragMatch = requestPath.match(/^\/([a-z]{2}(?:-[a-z]+)?)\/(@.+)$/)
  if (localeFragMatch) {
    previewLocale = localeFragMatch[1]
    fragRequestPath = `/${localeFragMatch[2]}`
  }
  if (fragRequestPath.startsWith('/@')) {
    const fragmentName = fragRequestPath.slice(2)
    try {
      const resolved = await resolveFragment(fragmentName, site, previewLocale)
      if (overrides) applyOverrides(resolved, overrides)
      return c.html(await renderFragment(resolved, previewLocale))
    } catch (err) {
      const e = err as Error
      const msg = e.message.replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const stack = (e.stack ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      return c.html(
        `<div style="font-family:system-ui;padding:2rem;color:#fca5a5;background:#1a1a2e;min-height:100vh"><h2 style="color:#f87171;margin-bottom:1rem">Template Error</h2><pre style="white-space:pre-wrap;font-size:0.875rem;line-height:1.7">${msg}</pre><details style="margin-top:1rem"><summary style="color:#52525b;cursor:pointer">Stack trace</summary><pre style="color:#52525b;font-size:0.75rem;margin-top:0.5rem">${stack}</pre></details></div>`,
        500,
      )
    }
  }

  for (const { name: pageName, page, locale: pageLocale } of allPageEntries(site)) {
    const params = matchRoute(page.route, requestPath)
    if (params) {
      try {
        const resolved = await resolvePage(pageName, site, pageLocale)
        if (overrides) applyOverrides(resolved, overrides)
        return c.html(
          await renderPage(resolved, {
            routeParams: params,
            metadata: page.metadata,
            route: page.route,
            seo: {
              siteName: site.manifest.name,
              locale: pageLocale ?? site.manifest.locale,
              defaultOgImage: site.manifest.defaultOgImage,
            },
          }),
        )
      } catch (err) {
        const e = err as Error
        const msg = e.message.replace(/</g, '&lt;').replace(/>/g, '&gt;')
        const stack = (e.stack ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        return c.html(
          `<div style="font-family:system-ui;padding:2rem;color:#fca5a5;background:#1a1a2e;min-height:100vh"><h2 style="color:#f87171;margin-bottom:1rem">Template Error</h2><pre style="white-space:pre-wrap;font-size:0.875rem;line-height:1.7">${msg}</pre><details style="margin-top:1rem"><summary style="color:#52525b;cursor:pointer">Stack trace</summary><pre style="color:#52525b;font-size:0.75rem;margin-top:0.5rem">${stack}</pre></details></div>`,
          500,
        )
      }
    }
  }
  return c.html('<p>Page not found</p>', 404)
}

function applyOverrides(node: ResolvedComponent, overrides: Record<string, Record<string, unknown>>) {
  // Match on treePath (name path) for merged JSON format, fallback to filesystem path for compatibility
  const key = node.treePath ?? node.path
  if (key && overrides[key]) {
    node.content = overrides[key]
  }
  for (const child of node.children) {
    applyOverrides(child, overrides)
  }
}

function matchRoute(route: string, path: string): Record<string, string> | null {
  const routeParts = route.split('/')
  const pathParts = path.split('/')
  if (routeParts.length !== pathParts.length) return null

  const params: Record<string, string> = {}
  for (let i = 0; i < routeParts.length; i++) {
    if (routeParts[i].startsWith(':')) {
      params[routeParts[i].slice(1)] = pathParts[i]
    } else if (routeParts[i] !== pathParts[i]) {
      return null
    }
  }
  return params
}
