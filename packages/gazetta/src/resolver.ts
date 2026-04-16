import type { ResolvedComponent, ComponentEntry, InlineComponent } from './types.js'
import { loadTemplate } from './template-loader.js'
import { processContent } from './content.js'
import type { Site } from './site-loader.js'

interface ResolveContext {
  site: Site
  templatesDir: string
  visited: Set<string>
  path: string[]
}

export async function resolveComponent(entry: ComponentEntry, ctx: ResolveContext): Promise<ResolvedComponent> {
  if (typeof entry === 'string') {
    if (!entry.startsWith('@')) {
      throw new Error(
        `Invalid component entry "${entry}" — string entries must be fragment references starting with @.\n` +
          `  Referenced in: ${ctx.path.join(' → ') || 'page root'}`,
      )
    }
    const fragmentName = entry.slice(1)
    return resolveFragmentRef(fragmentName, ctx)
  }

  return resolveInlineComponent(entry, ctx)
}

async function resolveFragmentRef(fragmentName: string, ctx: ResolveContext): Promise<ResolvedComponent> {
  const key = `@${fragmentName}`
  if (ctx.visited.has(key)) {
    throw new Error(`Circular reference detected: ${key}\n` + `  Resolution path: ${ctx.path.join(' → ')} → ${key}`)
  }
  ctx.visited.add(key)
  ctx.path.push(key)

  const fragment = ctx.site.fragments.get(fragmentName)
  if (!fragment) {
    const available = [...ctx.site.fragments.keys()]
    ctx.path.pop()
    ctx.visited.delete(key)
    throw new Error(
      `Fragment "@${fragmentName}" not found.\n` +
        `  Referenced in: ${ctx.path.join(' → ') || 'page root'}\n` +
        `  Available fragments: ${available.length > 0 ? available.join(', ') : '(none)'}`,
    )
  }

  const loaded = await loadTemplate(ctx.site.storage, ctx.templatesDir, fragment.template)
  const children: ResolvedComponent[] = []
  if (fragment.components) {
    for (const child of fragment.components) {
      children.push(await resolveComponent(child, ctx))
    }
  }

  const treePath = ctx.path.slice(1).join('/')
  ctx.path.pop()
  ctx.visited.delete(key)

  return {
    template: loaded.render,
    content: processContent(fragment.content, loaded.schema),
    children,
    path: fragment.dir,
    treePath,
  }
}

async function resolveInlineComponent(comp: InlineComponent, ctx: ResolveContext): Promise<ResolvedComponent> {
  const key = comp.name
  if (ctx.visited.has(key)) {
    throw new Error(`Circular reference detected: ${key}\n` + `  Resolution path: ${ctx.path.join(' → ')} → ${key}`)
  }
  ctx.visited.add(key)
  ctx.path.push(comp.name)

  const loaded = await loadTemplate(ctx.site.storage, ctx.templatesDir, comp.template)
  const children: ResolvedComponent[] = []
  if (comp.components) {
    for (const child of comp.components) {
      children.push(await resolveComponent(child, ctx))
    }
  }

  const treePath = ctx.path.slice(1).join('/')
  ctx.path.pop()
  ctx.visited.delete(key)

  return { template: loaded.render, content: processContent(comp.content, loaded.schema), children, treePath }
}

export async function resolveFragment(fragmentName: string, site: Site): Promise<ResolvedComponent> {
  const fragment = site.fragments.get(fragmentName)
  if (!fragment) {
    const available = [...site.fragments.keys()]
    throw new Error(
      `Fragment "${fragmentName}" not found.\n` +
        `  Available fragments: ${available.length > 0 ? available.join(', ') : '(none)'}`,
    )
  }

  const templatesDir = site.templatesDir
  const ctx: ResolveContext = { site, templatesDir, visited: new Set(), path: ['', `@${fragmentName}`] }

  const loaded = await loadTemplate(site.storage, templatesDir, fragment.template)
  const children: ResolvedComponent[] = []
  if (fragment.components) {
    for (const child of fragment.components) {
      children.push(await resolveComponent(child, ctx))
    }
  }

  return {
    template: loaded.render,
    content: processContent(fragment.content, loaded.schema),
    children,
    path: fragment.dir,
    treePath: '',
  }
}

export async function resolvePage(pageName: string, site: Site): Promise<ResolvedComponent> {
  const page = site.pages.get(pageName)
  if (!page) {
    const available = [...site.pages.keys()]
    throw new Error(
      `Page "${pageName}" not found.\n` +
        `  Available pages: ${available.length > 0 ? available.join(', ') : '(none)'}`,
    )
  }

  const templatesDir = site.templatesDir
  const ctx: ResolveContext = { site, templatesDir, visited: new Set(), path: [pageName] }

  const loaded = await loadTemplate(site.storage, templatesDir, page.template)
  const children: ResolvedComponent[] = []
  if (page.components) {
    for (const child of page.components) {
      children.push(await resolveComponent(child, ctx))
    }
  }

  return {
    template: loaded.render,
    content: processContent(page.content, loaded.schema),
    children,
    path: page.dir,
    treePath: '',
  }
}
