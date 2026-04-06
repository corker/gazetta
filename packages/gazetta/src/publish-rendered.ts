import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { StorageProvider, PurgeStrategy } from './types.js'
import { loadSite } from './site-loader.js'
import { resolvePage, resolveComponent } from './resolver.js'
import { renderComponent } from './renderer.js'
import { resetScopeCounter } from './scope.js'

function contentHash(content: string): string {
  return createHash('md5').update(content).digest('hex').slice(0, 8)
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
): Promise<{ files: number }> {
  const site = await loadSite(sourceDir, sourceStorage)
  const page = site.pages.get(pageName)
  if (!page) throw new Error(`Page "${pageName}" not found`)

  resetScopeCounter()
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

  // Determine page path from route
  const routePath = page.route === '/' ? 'home' : page.route.replace(/^\//, '')
  const pageDir = `pages/${routePath}`

  let fileCount = 0

  // Write page CSS as hashed file
  const pageCss = localCssParts.join('\n')
  let pageCssLink = ''
  if (pageCss) {
    const hash = contentHash(pageCss)
    const cssPath = `${pageDir}/styles.${hash}.css`
    await targetStorage.mkdir(pageDir)
    await targetStorage.writeFile(cssPath, pageCss)
    pageCssLink = `<link rel="stylesheet" href="/${cssPath}">`
    fileCount++
  }

  // Build page HTML
  const title = (page.metadata?.title as string) ?? 'Gazetta'
  const description = page.metadata?.description as string | undefined

  const metaTags = [
    description ? `<meta name="description" content="${description}">` : '',
    title ? `<meta property="og:title" content="${title}">` : '',
    description ? `<meta property="og:description" content="${description}">` : '',
  ].filter(Boolean).join('\n  ')

  // Write page JS as hashed file (if any)
  const pageJs = localJsParts.join('\n')
  let pageJsLink = ''
  if (pageJs) {
    const hash = contentHash(pageJs)
    const jsPath = `${pageDir}/script.${hash}.js`
    await targetStorage.mkdir(pageDir)
    await targetStorage.writeFile(jsPath, pageJs)
    pageJsLink = `<script type="module" src="/${jsPath}"></script>`
    fileCount++
  }

  const headContent = [
    `<meta charset="UTF-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1.0">`,
    `<title>${title}</title>`,
    metaTags,
    ...localHeadParts,
    // CSS first, then ESI heads (fragment CSS + JS), then page JS
    pageCssLink,
    ...esiHeadTags,
    pageJsLink,
  ].filter(Boolean).join('\n  ')

  const bodyContent = bodyParts.join('\n')

  const html = `<!DOCTYPE html>
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

  return { files: fileCount }
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
): Promise<{ files: number }> {
  const site = await loadSite(sourceDir, sourceStorage)
  const fragment = site.fragments.get(fragmentName)
  if (!fragment) throw new Error(`Fragment "${fragmentName}" not found`)

  const templatesDir = join(sourceDir, 'templates')
  const ctx = { site, templatesDir, visited: new Set<string>(), path: [`@${fragmentName}`] }
  const resolved = await resolveComponent(`@${fragmentName}`, '', ctx)

  resetScopeCounter()
  const rendered = await renderComponent(resolved)

  const fragDir = `fragments/${fragmentName}`
  let fileCount = 0

  // Write fragment CSS as hashed file
  const headParts: string[] = []
  if (rendered.css) {
    const hash = contentHash(rendered.css)
    const cssPath = `${fragDir}/styles.${hash}.css`
    await targetStorage.mkdir(fragDir)
    await targetStorage.writeFile(cssPath, rendered.css)
    headParts.push(`<link rel="stylesheet" href="/${cssPath}">`)
    fileCount++
  }

  // Write fragment JS as hashed file (if any)
  if (rendered.js) {
    const hash = contentHash(rendered.js)
    const jsPath = `${fragDir}/script.${hash}.js`
    await targetStorage.mkdir(fragDir)
    await targetStorage.writeFile(jsPath, rendered.js)
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

  return { files: fileCount }
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
