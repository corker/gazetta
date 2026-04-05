import { join } from 'node:path'
import type { ResolvedComponent, ComponentManifest } from '@gazetta/shared'
import { parseComponentManifest, fileExists } from './manifest.js'
import { loadTemplate } from './template-loader.js'
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
    if (!await fileExists(manifestPath)) {
      throw new Error(
        `Component "${name}" not found. Expected manifest at ${manifestPath}\n` +
        `  Referenced in: ${ctx.path.slice(0, -1).join(' → ') || 'page root'}\n` +
        `  Parent directory: ${parentDir}`
      )
    }
    manifest = await parseComponentManifest(manifestPath)
  }

  const template = await loadTemplate(ctx.templatesDir, manifest.template)

  const children: ResolvedComponent[] = []
  if (manifest.components) {
    for (const childName of manifest.components) {
      children.push(await resolveComponent(childName, componentDir, ctx))
    }
  }

  ctx.path.pop()
  ctx.visited.delete(key)

  return { template, content: manifest.content, children }
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

  const template = await loadTemplate(templatesDir, page.template)

  const children: ResolvedComponent[] = []
  if (page.components) {
    for (const childName of page.components) {
      children.push(await resolveComponent(childName, page.dir, ctx))
    }
  }

  return { template, content: page.content, children }
}
