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

/**
 * Build and store reverse fragment index.
 * Maps each fragment to the list of page routes that use it.
 * Used by purge-by-URL strategy to know which pages to invalidate.
 */
export async function publishFragmentIndex(
  sourceStorage: StorageProvider,
  sourceDir: string,
  targetStorage: StorageProvider,
): Promise<Record<string, string[]>> {
  const site = await loadSite(sourceDir, sourceStorage)
  const index: Record<string, string[]> = {}

  for (const [_pageName, page] of site.pages) {
    if (!page.components) continue
    for (const comp of page.components) {
      if (comp.startsWith('@')) {
        if (!index[comp]) index[comp] = []
        index[comp].push(page.route)
      }
    }
  }

  await targetStorage.mkdir('index')
  await targetStorage.writeFile('index/fragments.json', JSON.stringify(index))
  return index
}

/** Purge strategy interface */
export interface PurgeStrategy {
  purgeAll(): Promise<void>
  purgeUrls(urls: string[]): Promise<void>
}

/** Purge via Worker's /purge endpoints */
export function createWorkerPurge(workerUrl: string, token?: string): PurgeStrategy {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  return {
    async purgeAll() {
      await fetch(`${workerUrl}/purge/all`, { method: 'POST', headers })
    },
    async purgeUrls(urls: string[]) {
      await fetch(`${workerUrl}/purge/urls`, { method: 'POST', headers, body: JSON.stringify({ urls }) })
    },
  }
}

/**
 * Publish a fragment and purge affected pages.
 * - purge: 'all' → purge entire cache (free tier)
 * - purge: 'url' → read reverse index, purge only affected page URLs (pro tier)
 */
export async function publishFragmentWithPurge(
  fragmentName: string,
  sourceStorage: StorageProvider,
  sourceDir: string,
  targetStorage: StorageProvider,
  purge: PurgeStrategy,
  purgeMode: 'all' | 'url' = 'all',
): Promise<{ files: number; purgedUrls: string[] }> {
  const result = await publishFragmentRendered(fragmentName, sourceStorage, sourceDir, targetStorage)

  if (purgeMode === 'all') {
    await purge.purgeAll()
    return { ...result, purgedUrls: ['*'] }
  }

  // Read reverse index to find affected pages
  let index: Record<string, string[]> = {}
  try {
    index = JSON.parse(await targetStorage.readFile('index/fragments.json'))
  } catch { /* no index yet */ }

  const urls = index[`@${fragmentName}`] ?? []
  if (urls.length > 0) {
    await purge.purgeUrls(urls)
  }
  return { ...result, purgedUrls: urls }
}

/**
 * Publish a page and purge its URL.
 */
export async function publishPageWithPurge(
  pageName: string,
  sourceStorage: StorageProvider,
  sourceDir: string,
  targetStorage: StorageProvider,
  purge: PurgeStrategy,
): Promise<{ files: number; purgedUrls: string[] }> {
  const result = await publishPageRendered(pageName, sourceStorage, sourceDir, targetStorage)

  // Read the page manifest to get its route
  const manifest: PublishedPageManifest = JSON.parse(await targetStorage.readFile(`pages/${pageName}.json`))
  await purge.purgeUrls([manifest.route])

  // Update the fragment index
  await publishFragmentIndex(sourceStorage, sourceDir, targetStorage)

  return { ...result, purgedUrls: [manifest.route] }
}
