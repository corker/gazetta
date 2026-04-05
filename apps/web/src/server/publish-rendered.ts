import { join } from 'node:path'
import type { StorageProvider, RenderOutput } from '@gazetta/core'
import { loadSite, resolvePage, renderComponent, resetScopeCounter } from '@gazetta/renderer'
import type { Site } from '@gazetta/renderer'

/** Published page manifest — stored in S3 as pages/<name>.json */
export interface PublishedPageManifest {
  route: string
  metadata?: Record<string, unknown>
  components: string[]
}

/** Published component — stored in S3 as components/<key>.json */
export interface PublishedComponent {
  html: string
  css: string
  js: string
  head?: string
}

/**
 * Publish a page: SSR all components and store pre-rendered output + manifest in target.
 */
export async function publishPageRendered(
  pageName: string,
  sourceStorage: StorageProvider,
  sourceDir: string,
  targetStorage: StorageProvider,
): Promise<{ files: number }> {
  const site = await loadSite(sourceDir, sourceStorage)
  const page = site.pages.get(pageName)
  if (!page) throw new Error(`Page "${pageName}" not found`)

  resetScopeCounter()

  // Resolve and render the full page tree
  const resolved = await resolvePage(pageName, site)

  // Render each top-level child component and store individually
  const componentKeys: string[] = []
  let fileCount = 0

  for (let i = 0; i < resolved.children.length; i++) {
    const child = resolved.children[i]
    const childName = page.components![i]
    const key = childName.startsWith('@') ? childName : `${pageName}/${childName}`

    const rendered = renderComponent(child)
    const json: PublishedComponent = {
      html: rendered.html,
      css: rendered.css,
      js: rendered.js,
      head: rendered.head,
    }

    await targetStorage.mkdir('components')
    await targetStorage.writeFile(`components/${key}.json`, JSON.stringify(json))
    componentKeys.push(key)
    fileCount++
  }

  // Store the page manifest
  const manifest: PublishedPageManifest = {
    route: page.route,
    metadata: page.metadata,
    components: componentKeys,
  }

  await targetStorage.mkdir('pages')
  await targetStorage.writeFile(`pages/${pageName}.json`, JSON.stringify(manifest))
  fileCount++

  // Store the page-level template output (global CSS, etc.)
  const pageOutput = resolved.template({ content: resolved.content, children: resolved.children.map(c => renderComponent(c)) })
  await targetStorage.writeFile(`pages/${pageName}.layout.json`, JSON.stringify({
    css: pageOutput.css,
    head: pageOutput.head,
  }))
  fileCount++

  return { files: fileCount }
}

/**
 * Publish a fragment: SSR it and store pre-rendered output in target.
 * All pages referencing this fragment get the update on next request.
 */
export async function publishFragmentRendered(
  fragmentName: string,
  sourceStorage: StorageProvider,
  sourceDir: string,
  targetStorage: StorageProvider,
): Promise<{ files: number }> {
  const site = await loadSite(sourceDir, sourceStorage)
  const fragment = site.fragments.get(fragmentName)
  if (!fragment) throw new Error(`Fragment "${fragmentName}" not found`)

  // Build a minimal resolved component for the fragment
  const { resolveComponent } = await import('@gazetta/renderer')
  const templatesDir = join(sourceDir, 'templates')
  const ctx = { site, templatesDir, visited: new Set<string>(), path: [`@${fragmentName}`] }
  const resolved = await resolveComponent(`@${fragmentName}`, '', ctx)

  resetScopeCounter()
  const rendered = renderComponent(resolved)
  const json: PublishedComponent = {
    html: rendered.html,
    css: rendered.css,
    js: rendered.js,
    head: rendered.head,
  }

  await targetStorage.mkdir('components')
  await targetStorage.writeFile(`components/@${fragmentName}.json`, JSON.stringify(json))

  return { files: 1 }
}

/**
 * Publish site.yaml (stripped of targets config — not needed on the target)
 */
export async function publishSiteManifest(
  sourceStorage: StorageProvider,
  sourceDir: string,
  targetStorage: StorageProvider,
): Promise<void> {
  const site = await loadSite(sourceDir, sourceStorage)
  const manifest = { name: site.manifest.name, version: site.manifest.version }
  await targetStorage.writeFile('site.json', JSON.stringify(manifest))
}
