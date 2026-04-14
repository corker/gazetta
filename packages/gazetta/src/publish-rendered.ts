import { createHash } from 'node:crypto'
import type { StorageProvider, PurgeStrategy, CacheConfig } from './types.js'
import type { Site } from './site-loader.js'
import { loadSite } from './site-loader.js'
import { resolvePage, resolveComponent } from './resolver.js'
import { renderComponent, renderPage } from './renderer.js'
import { parseSidecarName, sidecarNameFor, parseUsesSidecarName, usesSidecarNameFor, parseTemplateSidecarName, templateSidecarNameFor } from './hash.js'

function contentHash(content: string): string {
  return createHash('md5').update(content).digest('hex').slice(0, 8)
}

/**
 * Walk a component tree and collect every @fragment reference, recursing
 * into inline components' children. Used to write .uses-* sidecars so the
 * reverse-dep lookup can skip content reads entirely — just readDir and
 * pattern-match on filenames.
 */
function collectFragmentRefs(components: unknown[] | undefined): string[] {
  const refs = new Set<string>()
  function walk(entries: unknown[] | undefined) {
    if (!Array.isArray(entries)) return
    for (const entry of entries) {
      if (typeof entry === 'string' && entry.startsWith('@')) refs.add(entry.slice(1))
      else if (typeof entry === 'object' && entry !== null) {
        walk((entry as { components?: unknown[] }).components)
      }
    }
  }
  walk(components)
  return [...refs]
}

/**
 * Write sidecars for a published page/fragment:
 *   - .{hash}.hash — content hash, used by compare-targets
 *   - .uses-{fragment} — one per @ reference; used by findFragmentDependents
 *   - .tpl-{template} — template name; used to flag republish-needed when a
 *     template's schema changes
 *
 * All three are filename-only (zero-byte). A single readDir returns the full
 * dependency picture for this item without any content reads — so scanning
 * 10k pages for "who uses @header" costs N LIST calls, not N GET calls.
 *
 * Stale sidecars of each kind are removed first, so old .uses-* and .tpl-*
 * from a previous publish don't linger if the page now references different
 * fragments / uses a different template.
 */
async function writeSidecar(
  storage: StorageProvider,
  dir: string,
  hash: string,
  uses: string[] = [],
  template?: string,
): Promise<void> {
  const want = new Set<string>([sidecarNameFor(hash)])
  for (const frag of uses) want.add(usesSidecarNameFor(frag))
  if (template) want.add(templateSidecarNameFor(template))

  // Remove stale sidecars of any known kind that aren't in `want`.
  try {
    const entries = await storage.readDir(dir)
    for (const e of entries) {
      if (want.has(e.name)) continue
      if (parseSidecarName(e.name) || parseUsesSidecarName(e.name) || parseTemplateSidecarName(e.name)) {
        try { await storage.rm(`${dir}/${e.name}`) } catch { /* already gone */ }
      }
    }
  } catch { /* dir doesn't exist yet — mkdir below */ }
  await storage.mkdir(dir)
  // Write in parallel — these are tiny and independent.
  await Promise.all([...want].map(name => storage.writeFile(`${dir}/${name}`, '')))
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
  templatesDir?: string,
  manifestHash?: string,
  preloadedSite?: Site,
): Promise<{ files: number; removed: number }> {
  // Reuse a preloaded site when the caller already has one (runPublish loops
  // over N items; loading per-item was quadratic). loadSite is idempotent.
  const site = preloadedSite ?? await loadSite({ siteDir: sourceDir, storage: sourceStorage, templatesDir })
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
    const childEntry = page.components![i]
    const isFragment = typeof childEntry === 'string' && childEntry.startsWith('@')

    if (isFragment) {
      const fragName = childEntry.slice(1)
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

  // Write content-hash sidecar + reverse-dep sidecars for compare/dependents
  if (manifestHash) {
    await writeSidecar(targetStorage, pageDir, manifestHash, collectFragmentRefs(page.components), page.template)
  }

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
  templatesDir?: string,
  manifestHash?: string,
  preloadedSite?: Site,
): Promise<{ files: number }> {
  const site = preloadedSite ?? await loadSite({ siteDir: sourceDir, storage: sourceStorage, templatesDir })
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
  // Sidecars go under pages/{name}/ regardless of static route layout, so compare
  // + dependents find them the same way as for ESI targets. pages/ doesn't clash
  // with static serving (routes are / and /{route}, not /pages/*).
  if (manifestHash) {
    await writeSidecar(targetStorage, `pages/${pageName}`, manifestHash, collectFragmentRefs(page.components), page.template)
  }

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
  templatesDir?: string,
  manifestHash?: string,
  preloadedSite?: Site,
): Promise<{ files: number; removed: number }> {
  const site = preloadedSite ?? await loadSite({ siteDir: sourceDir, storage: sourceStorage, templatesDir })
  const fragment = site.fragments.get(fragmentName)
  if (!fragment) throw new Error(`Fragment "${fragmentName}" not found`)

  const ctx = { site, templatesDir: site.templatesDir, visited: new Set<string>(), path: [`@${fragmentName}`] }
  const resolved = await resolveComponent(`@${fragmentName}`, ctx)

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

  // Write content-hash sidecar + reverse-dep sidecars for compare/dependents
  if (manifestHash) {
    await writeSidecar(targetStorage, fragDir, manifestHash, collectFragmentRefs(fragment.components), fragment.template)
  }

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
  preloadedSite?: Site,
): Promise<void> {
  const site = preloadedSite ?? await loadSite({ siteDir: sourceDir, storage: sourceStorage })
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
  preloadedSite?: Site,
): Promise<Record<string, string[]>> {
  const site = preloadedSite ?? await loadSite({ siteDir: sourceDir, storage: sourceStorage })
  const index: Record<string, string[]> = {}

  for (const [_pageName, page] of site.pages) {
    if (!page.components) continue
    for (const entry of page.components) {
      if (typeof entry === 'string' && entry.startsWith('@')) {
        if (!index[entry]) index[entry] = []
        index[entry].push(page.route)
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

  const site = await loadSite({ siteDir: sourceDir, storage: sourceStorage })
  const page = site.pages.get(pageName)
  if (page) await purge.purgeUrls([page.route])

  await publishFragmentIndex(sourceStorage, sourceDir, targetStorage)

  return { ...result, purgedUrls: page ? [page.route] : [] }
}
