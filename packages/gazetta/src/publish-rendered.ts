import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { StorageProvider, PurgeStrategy, CacheConfig } from './types.js'
import { loadSite } from './site-loader.js'
import { resolvePage, resolveComponent } from './resolver.js'
import { renderComponent, renderPage } from './renderer.js'

function contentHash(content: string): string {
  return createHash('md5').update(content).digest('hex').slice(0, 8)
}

/** List existing hashed files (styles.*.css, script.*.js) in a directory */
async function listHashedFiles(storage: StorageProvider, dir: string): Promise<string[]> {
  try {
    const entries = await storage.readDir(dir)
    return entries
      .filter(e => !e.isDirectory && /\.(css|js)$/.test(e.name) && /\.[a-f0-9]{8}\./.test(e.name))
      .map(e => `${dir}/${e.name}`)
  } catch {
    return []
  }
}

/** Delete files that existed before but weren't written this time */
async function cleanupOldFiles(storage: StorageProvider, oldFiles: string[], newFiles: string[]): Promise<number> {
  const newSet = new Set(newFiles)
  let removed = 0
  for (const file of oldFiles) {
    if (!newSet.has(file)) {
      try { await storage.rm(file); removed++ } catch { /* already gone */ }
    }
  }
  return removed
}

/**
 * Publish a page as HTML with ESI placeholders for fragments.
 * Local components are baked in. Fragment markup is replaced at request time by the worker.
 * CSS is stored as separate hashed files for immutable caching.
 */
export async function publishPageRendered(
  pageName: string,
  sourceStorage: StorageProvider,
  sourceDir: string,
  targetStorage: StorageProvider,
  targetCache?: CacheConfig,
): Promise<{ files: number; removed: number }> {
  const site = await loadSite(sourceDir, sourceStorage)
  const page = site.pages.get(pageName)
  if (!page) throw new Error(`Page "${pageName}" not found`)

  // Scope IDs are now deterministic (hash-based), no reset needed
  const resolved = await resolvePage(pageName, site)

  // Render each child — fragments become ESI placeholders, local components baked in
  const bodyParts: string[] = []
  const localCssParts: string[] = []
  const localJsParts: string[] = []
  const localHeadParts: string[] = []
  const esiHeadTags: string[] = []

  for (let i = 0; i < resolved.children.length; i++) {
    const childName = page.components![i]
    const isFragment = childName.startsWith('@')

    if (isFragment) {
      const fragName = childName.slice(1)
      const fragPath = `fragments/${fragName}/index.html`
      esiHeadTags.push(`<!--esi-head:/${fragPath}-->`)
      bodyParts.push(`<!--esi:/${fragPath}-->`)
    } else {
      const rendered = await renderComponent(resolved.children[i])
      bodyParts.push(rendered.html)
      if (rendered.css) localCssParts.push(rendered.css)
      if (rendered.js) localJsParts.push(rendered.js)
      if (rendered.head) localHeadParts.push(rendered.head)
    }
  }

  // Render page-level template (layout CSS, head tags)
  const childOutputs = await Promise.all(resolved.children.map(c => renderComponent(c)))
  const pageOutput = await resolved.template({ content: resolved.content, children: childOutputs })
  if (pageOutput.css) localCssParts.unshift(pageOutput.css)
  if (pageOutput.head) localHeadParts.unshift(pageOutput.head)

  // Use page name as path (matches source folder structure)
  const pageDir = `pages/${pageName}`

  // Remember old hashed files for cleanup
  const oldFiles = await listHashedFiles(targetStorage, pageDir)
  const newFiles: string[] = []
  let fileCount = 0

  // Write page CSS as hashed file
  const pageCss = localCssParts.join('\n')
  let pageCssLink = ''
  if (pageCss) {
    const hash = contentHash(pageCss)
    const cssPath = `${pageDir}/styles.${hash}.css`
    await targetStorage.mkdir(pageDir)
    await targetStorage.writeFile(cssPath, pageCss)
    newFiles.push(cssPath)
    pageCssLink = `<link rel="stylesheet" href="/${cssPath}">`
    fileCount++
  }

  // Write page JS as hashed file (if any)
  const pageJs = localJsParts.join('\n')
  let pageJsLink = ''
  if (pageJs) {
    const hash = contentHash(pageJs)
    const jsPath = `${pageDir}/script.${hash}.js`
    await targetStorage.mkdir(pageDir)
    await targetStorage.writeFile(jsPath, pageJs)
    newFiles.push(jsPath)
    pageJsLink = `<script type="module" src="/${jsPath}"></script>`
    fileCount++
  }

  const headContent = [
    `<meta charset="UTF-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1.0">`,
    ...localHeadParts,
    pageCssLink,
    ...esiHeadTags,
    pageJsLink,
  ].filter(Boolean).join('\n  ')

  const bodyContent = bodyParts.join('\n')

  // Resolve cache config: page → target → defaults
  const browser = page.cache?.browser ?? targetCache?.browser ?? 0
  const edge = page.cache?.edge ?? targetCache?.edge ?? 86400
  const cacheComment = `<!--cache:browser=${browser},edge=${edge}-->\n`

  const html = `${cacheComment}<!DOCTYPE html>
<html lang="en">
<head>
  ${headContent}
</head>
<body>
${bodyContent}
</body>
</html>`

  await targetStorage.mkdir(pageDir)
  await targetStorage.writeFile(`${pageDir}/index.html`, html)
  fileCount++

  // Clean up old hashed files
  const removed = await cleanupOldFiles(targetStorage, oldFiles, newFiles)

  return { files: fileCount, removed }
}

/**
 * Publish a page as fully assembled HTML — no ESI, no worker needed.
 * All components (including fragments) are baked in. CSS/JS inline.
 * For static hosting: GitHub Pages, Netlify, Vercel, any file server.
 */
export async function publishPageStatic(
  pageName: string,
  sourceStorage: StorageProvider,
  sourceDir: string,
  targetStorage: StorageProvider,
): Promise<{ files: number }> {
  const site = await loadSite(sourceDir, sourceStorage)
  const page = site.pages.get(pageName)
  if (!page) throw new Error(`Page "${pageName}" not found`)

  // Scope IDs are now deterministic (hash-based), no reset needed
  const resolved = await resolvePage(pageName, site)
  const html = await renderPage(resolved)

  // URL path: / → index.html, /about → about/index.html
  const urlPath = page.route === '/' ? '' : page.route.replace(/^\//, '')
  const outputPath = urlPath ? `${urlPath}/index.html` : 'index.html'
  const outputDir = urlPath || '.'

  await targetStorage.mkdir(outputDir)
  await targetStorage.writeFile(outputPath, html)

  return { files: 1 }
}

/**
 * Publish a fragment as HTML with a <head> section for CSS/JS.
 * The worker injects <head> content before </head> and body content at the ESI placeholder.
 */
export async function publishFragmentRendered(
  fragmentName: string,
  sourceStorage: StorageProvider,
  sourceDir: string,
  targetStorage: StorageProvider,
): Promise<{ files: number; removed: number }> {
  const site = await loadSite(sourceDir, sourceStorage)
  const fragment = site.fragments.get(fragmentName)
  if (!fragment) throw new Error(`Fragment "${fragmentName}" not found`)

  const templatesDir = join(sourceDir, 'templates')
  const ctx = { site, templatesDir, visited: new Set<string>(), path: [`@${fragmentName}`] }
  const resolved = await resolveComponent(`@${fragmentName}`, '', ctx)

  // Scope IDs are now deterministic (hash-based), no reset needed
  const rendered = await renderComponent(resolved)

  const fragDir = `fragments/${fragmentName}`
  const oldFiles = await listHashedFiles(targetStorage, fragDir)
  const newFiles: string[] = []
  let fileCount = 0

  // Write fragment CSS as hashed file
  const headParts: string[] = []
  if (rendered.css) {
    const hash = contentHash(rendered.css)
    const cssPath = `${fragDir}/styles.${hash}.css`
    await targetStorage.mkdir(fragDir)
    await targetStorage.writeFile(cssPath, rendered.css)
    newFiles.push(cssPath)
    headParts.push(`<link rel="stylesheet" href="/${cssPath}">`)
    fileCount++
  }

  // Write fragment JS as hashed file (if any)
  if (rendered.js) {
    const hash = contentHash(rendered.js)
    const jsPath = `${fragDir}/script.${hash}.js`
    await targetStorage.mkdir(fragDir)
    await targetStorage.writeFile(jsPath, rendered.js)
    newFiles.push(jsPath)
    headParts.push(`<script type="module" src="/${jsPath}"></script>`)
    fileCount++
  }

  if (rendered.head) {
    headParts.push(rendered.head)
  }

  // Build fragment HTML
  const headSection = headParts.length ? `<head>\n${headParts.join('\n')}\n</head>\n` : ''
  const fragmentHtml = `${headSection}${rendered.html}`

  await targetStorage.mkdir(fragDir)
  await targetStorage.writeFile(`${fragDir}/index.html`, fragmentHtml)
  fileCount++

  // Clean up old hashed files
  const removed = await cleanupOldFiles(targetStorage, oldFiles, newFiles)

  return { files: fileCount, removed }
}

/**
 * Publish site manifest (stripped of targets config).
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

/** Purge via Cloudflare zone cache API */
export function createCloudflarePurge(zoneId: string, apiToken: string): PurgeStrategy {
  const apiBase = `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiToken}` }

  return {
    async purgeAll() {
      const res = await fetch(apiBase, { method: 'POST', headers, body: JSON.stringify({ purge_everything: true }) })
      if (!res.ok) throw new Error(`Cloudflare purge failed: ${res.status} ${await res.text()}`)
    },
    async purgeUrls(urls: string[]) {
      const res = await fetch(apiBase, { method: 'POST', headers, body: JSON.stringify({ files: urls }) })
      if (!res.ok) throw new Error(`Cloudflare purge failed: ${res.status} ${await res.text()}`)
    },
  }
}

/** Look up Cloudflare zone ID from a site URL */
export async function lookupCloudflareZoneId(siteUrl: string, apiToken: string): Promise<string | null> {
  const domain = new URL(siteUrl).hostname.replace(/^www\./, '')
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${domain}`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  })
  if (!res.ok) return null
  const data = await res.json() as { result: Array<{ id: string }> }
  return data.result?.[0]?.id ?? null
}

/** @deprecated Use createCloudflarePurge instead */
export const createWorkerPurge = createCloudflarePurge

/**
 * Publish a fragment and purge affected pages.
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

  const site = await loadSite(sourceDir, sourceStorage)
  const page = site.pages.get(pageName)
  if (page) await purge.purgeUrls([page.route])

  await publishFragmentIndex(sourceStorage, sourceDir, targetStorage)

  return { ...result, purgedUrls: page ? [page.route] : [] }
}
