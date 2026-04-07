import { join } from 'node:path'
import type { ResolvedComponent, ComponentManifest } from './types.js'
import { parseComponentManifest } from './manifest.js'
import { loadTemplate } from './template-loader.js'
import { processContent } from './content.js'
import type { Site } from './site-loader.js'

interface ResolveContext {
  site: Site
  templatesDir: string
  visited: Set<string>
  path: string[]
}

export async function resolveComponent(
  name: string,
  parentDir: string,
  ctx: ResolveContext
): Promise<ResolvedComponent> {
  const isFragment = name.startsWith('@')
  const key = isFragment ? name : `${parentDir}/${name}`

  if (ctx.visited.has(key)) {
    throw new Error(
      `Circular reference detected: ${key}\n` +
      `  Resolution path: ${ctx.path.join(' → ')} → ${name}`
    )
  }
  ctx.visited.add(key)
  ctx.path.push(name)

  let manifest: ComponentManifest
  let componentDir: string
  const { storage } = ctx.site

  if (isFragment) {
    const fragmentName = name.slice(1)
    const fragment = ctx.site.fragments.get(fragmentName)
    if (!fragment) {
      const available = [...ctx.site.fragments.keys()]
      throw new Error(
        `Fragment "@${fragmentName}" not found.\n` +
        `  Referenced in: ${ctx.path.slice(0, -1).join(' → ') || 'page root'}\n` +
        `  Available fragments: ${available.length > 0 ? available.join(', ') : '(none)'}`
      )
    }
    manifest = fragment
    componentDir = fragment.dir
  } else {
    componentDir = join(parentDir, name)
    const manifestPath = join(componentDir, 'component.yaml')
    if (!await storage.exists(manifestPath)) {
      throw new Error(
        `Component "${name}" not found. Expected manifest at ${manifestPath}\n` +
        `  Referenced in: ${ctx.path.slice(0, -1).join(' → ') || 'page root'}\n` +
        `  Parent directory: ${parentDir}`
      )
    }
    manifest = await parseComponentManifest(storage, manifestPath)
  }

  const loaded = await loadTemplate(storage, ctx.templatesDir, manifest.template)

  const children: ResolvedComponent[] = []
  if (manifest.components) {
    for (const childName of manifest.components) {
      children.push(await resolveComponent(childName, componentDir, ctx))
    }
  }

  ctx.path.pop()
  ctx.visited.delete(key)

  return { template: loaded.render, content: processContent(manifest.content, loaded.schema), children, path: componentDir }
}

export async function resolvePage(pageName: string, site: Site): Promise<ResolvedComponent> {
  const page = site.pages.get(pageName)
  if (!page) {
    const available = [...site.pages.keys()]
    throw new Error(
      `Page "${pageName}" not found.\n` +
      `  Available pages: ${available.length > 0 ? available.join(', ') : '(none)'}`
    )
  }

  const templatesDir = join(site.siteDir, 'templates')
  const ctx: ResolveContext = { site, templatesDir, visited: new Set(), path: [pageName] }

  const loaded = await loadTemplate(site.storage, templatesDir, page.template)

  const children: ResolvedComponent[] = []
  if (page.components) {
    for (const childName of page.components) {
      children.push(await resolveComponent(childName, page.dir, ctx))
    }
  }

  return { template: loaded.render, content: processContent(page.content, loaded.schema), children, path: page.dir }
}
