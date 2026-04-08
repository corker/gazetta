#!/usr/bin/env node

import { resolve, join } from 'node:path'
import { watch, existsSync, readFileSync } from 'node:fs'
import { spawn, type ChildProcess } from 'node:child_process'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import yaml from 'js-yaml'
import { loadSite } from '../site-loader.js'
import { resolvePage } from '../resolver.js'
import { renderPage } from '../renderer.js'
import { createFilesystemProvider } from '../providers/filesystem.js'
import { invalidateTemplate, invalidateAllTemplates } from '../template-loader.js'
// createTargetRegistry is used lazily by admin-api publish routes
import type { SiteManifest } from '../types.js'
import { createAdminApp } from '../admin-api/index.js'

const args = process.argv.slice(2)
const command = args[0]

function printHelp() {
  console.log(`
  gazetta - Stateless CMS for composable websites

  Usage:
    gazetta init [dir]        Create a new site
    gazetta dev [site-dir]    Start dev server + CMS at /admin
    gazetta publish [site-dir] Pre-render and publish to targets
    gazetta deploy -t <name>  Deploy worker to hosting (one-time setup)
    gazetta validate [site-dir] Check site for broken references
    gazetta help              Show this help message

  Options:
    --port, -p <port>         Server port (default: 3000)
    --target, -t <name>       Target to publish/deploy to (default: all)

  Examples:
    gazetta init my-site            # scaffold a new site
    gazetta dev                     # dev server + CMS
    gazetta publish                  # publish to all targets
    gazetta publish -t production   # publish to specific target
    gazetta deploy -t production    # deploy worker (one-time)
    gazetta validate                # check site for broken references
`)
}

function parseArgs(input: string[]): { siteDir: string; port?: number; target?: string } {
  let siteDir = '.'
  let port: number | undefined
  let target: string | undefined
  for (let i = 0; i < input.length; i++) {
    if (input[i] === '--port' || input[i] === '-p') {
      port = parseInt(input[++i], 10)
    } else if (input[i] === '--target' || input[i] === '-t') {
      target = input[++i]
    } else if (!input[i].startsWith('-')) {
      siteDir = input[i]
    }
  }
  return { siteDir: resolve(siteDir), port, target }
}

async function runInit(dir: string) {
  const { writeFile, mkdir } = await import('node:fs/promises')
  const target = resolve(dir)

  if (existsSync(join(target, 'site.yaml'))) {
    console.error(`\n  Error: site.yaml already exists in ${target}\n`)
    process.exit(1)
  }

  const name = target.split('/').pop() ?? 'my-site'

  const files: Record<string, string> = {
    'site.yaml': `name: ${name}\nversion: 1.0.0\n`,

    'templates/page-layout/index.ts': `import { z } from 'zod'
import type { TemplateFunction } from 'gazetta'

export const schema = z.object({
  title: z.string().describe('Page title'),
  description: z.string().optional().describe('Page description'),
})

type Content = z.infer<typeof schema>

const template: TemplateFunction<Content> = ({ content, children = [] }) => ({
  html: \`<main>\${children.map(c => c.html).join('\\n')}</main>\`,
  css: \`main { max-width: 800px; margin: 0 auto; padding: 2rem; font-family: system-ui, sans-serif; }
\${children.map(c => c.css).join('\\n')}\`,
  js: children.map(c => c.js).filter(Boolean).join('\\n'),
  head: \`<title>\${content?.title ?? ''}</title>
\${content?.description ? \`<meta name="description" content="\${content.description}">\` : ''}
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>">
\${children.map(c => c.head).filter(Boolean).join('\\n')}\`,
})

export default template
`,

    'templates/hero/index.ts': `import { z } from 'zod'
import type { TemplateFunction } from 'gazetta'

export const schema = z.object({
  title: z.string().describe('Page title'),
  subtitle: z.string().optional().describe('Subtitle text'),
})

const template: TemplateFunction = ({ content = {} }) => ({
  html: \`<section class="hero">
  <h1>\${content.title ?? ''}</h1>
  <p>\${content.subtitle ?? ''}</p>
</section>\`,
  css: \`.hero { text-align: center; padding: 4rem 0; }
.hero h1 { font-size: 2.5rem; margin-bottom: 0.5rem; }
.hero p { color: #666; font-size: 1.25rem; }\`,
  js: '',
})

export default template
`,

    'templates/text-block/index.ts': `import { z } from 'zod'
import type { TemplateFunction } from 'gazetta'

export const schema = z.object({
  body: z.string().describe('Text content (HTML allowed)'),
})

const template: TemplateFunction = ({ content = {} }) => ({
  html: \`<div class="text-block">\${content.body ?? ''}</div>\`,
  css: \`.text-block { line-height: 1.6; margin: 2rem 0; }\`,
  js: '',
})

export default template
`,

    'templates/nav/index.ts': `import { z } from 'zod'
import type { TemplateFunction } from 'gazetta'

export const schema = z.object({
  brand: z.string().describe('Site name'),
  links: z.array(z.object({
    label: z.string(),
    href: z.string(),
  })).describe('Navigation links'),
})

const template: TemplateFunction = ({ content = {} }) => {
  const links = (content.links ?? []) as Array<{ label: string; href: string }>
  return {
    html: \`<nav class="nav">
  <a class="nav-brand" href="/">\${content.brand ?? ''}</a>
  <div class="nav-links">\${links.map(l => \`<a href="\${l.href}">\${l.label}</a>\`).join('\\n    ')}</div>
</nav>\`,
    css: \`.nav { display: flex; align-items: center; justify-content: space-between; padding: 1rem 2rem; border-bottom: 1px solid #eee; }
.nav-brand { font-weight: 700; font-size: 1.125rem; text-decoration: none; color: #1a1a1a; }
.nav-links { display: flex; gap: 1.5rem; }
.nav-links a { text-decoration: none; color: #555; font-size: 0.875rem; }
.nav-links a:hover { color: #1a1a1a; }\`,
    js: '',
  }
}

export default template
`,

    'fragments/header/fragment.yaml': `template: nav
content:
  brand: ${name}
  links:
    - label: Home
      href: /
`,

    'pages/home/page.yaml': `route: /
template: page-layout
content:
  title: ${name}
  description: A site built with Gazetta
components:
  - "@header"
  - hero
  - intro
`,

    'pages/home/hero/component.yaml': `template: hero
content:
  title: Welcome to ${name}
  subtitle: A site built with Gazetta
`,

    'pages/home/intro/component.yaml': `template: text-block
content:
  body: "<p>Edit this content in the CMS at <a href='/admin'>/admin</a>.</p>"
`,

    'package.json': JSON.stringify({
      name,
      private: true,
      type: 'module',
      scripts: { dev: 'gazetta dev .' },
      dependencies: { gazetta: '*' },
      devDependencies: { tsx: '^4.21.0', zod: '^4.3.6' },
    }, null, 2) + '\n',
  }

  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(target, path)
    await mkdir(join(fullPath, '..'), { recursive: true })
    await writeFile(fullPath, content)
  }

  console.log(`\n  Created site in ${target}\n`)
  console.log(`  Next steps:`)
  if (dir !== '.') console.log(`    cd ${dir}`)
  console.log(`    npm install`)
  console.log(`    npx gazetta dev`)
  console.log()
}

async function runPublish(siteDir: string, targetName?: string) {
  const storage = createFilesystemProvider()

  console.log(`\n  Loading site from ${siteDir}...`)
  const site = await loadSite(siteDir, storage)

  // Load target configs from site.yaml
  const siteYamlPath = join(siteDir, 'site.yaml')
  if (!existsSync(siteYamlPath)) {
    console.error(`\n  Error: No site.yaml found at ${siteDir}\n`)
    process.exit(1)
  }
  const siteYaml = yaml.load(readFileSync(siteYamlPath, 'utf-8')) as import('../types.js').SiteManifest
  if (!siteYaml.targets || Object.keys(siteYaml.targets).length === 0) {
    console.error(`\n  Error: No targets configured in site.yaml\n`)
    process.exit(1)
  }

  // Determine which targets to publish to
  const targetNames = targetName ? [targetName] : Object.keys(siteYaml.targets)
  for (const name of targetNames) {
    if (!siteYaml.targets[name]) {
      console.error(`\n  Error: Unknown target "${name}". Available: ${Object.keys(siteYaml.targets).join(', ')}\n`)
      process.exit(1)
    }
  }

  // Initialize targets
  const { createTargetRegistry } = await import('../targets.js')
  const targets = await createTargetRegistry(
    Object.fromEntries(targetNames.map(n => [n, siteYaml.targets![n]])),
    siteDir
  )

  const { publishPageRendered, publishPageStatic, publishFragmentRendered, publishSiteManifest, publishFragmentIndex } = await import('../publish-rendered.js')

  console.log(`\n  Site: ${site.manifest.name}`)
  console.log(`  Pages: ${[...site.pages.keys()].join(', ')}`)
  console.log(`  Fragments: ${[...site.fragments.keys()].join(', ')}`)
  console.log(`  Targets: ${targetNames.join(', ')}\n`)

  for (const name of targetNames) {
    const targetStorage = targets.get(name)
    if (!targetStorage) {
      console.error(`  ${name}: SKIPPED (failed to initialize)`)
      continue
    }

    const targetConfig = siteYaml.targets![name]
    const isStatic = !targetConfig?.worker
    console.log(`  Publishing to ${name}${isStatic ? ' (static)' : ' (ESI)'}...`)
    let totalFiles = 0

    if (isStatic) {
      // Static mode — fully assembled HTML, no fragments needed separately
      for (const pageName of site.pages.keys()) {
        const { files } = await publishPageStatic(pageName, storage, siteDir, targetStorage)
        totalFiles += files
        console.log(`    page: ${pageName} (${files} files)`)
      }
    } else {
      // ESI mode — fragments separate, pages with placeholders
      for (const fragName of site.fragments.keys()) {
        const { files } = await publishFragmentRendered(fragName, storage, siteDir, targetStorage)
        totalFiles += files
        console.log(`    fragment: ${fragName} (${files} files)`)
      }
      for (const pageName of site.pages.keys()) {
        const { files } = await publishPageRendered(pageName, storage, siteDir, targetStorage, targetConfig?.cache)
        totalFiles += files
        console.log(`    page: ${pageName} (${files} files)`)
      }
    }

    // Site manifest + fragment index
    await publishSiteManifest(storage, siteDir, targetStorage)
    await publishFragmentIndex(storage, siteDir, targetStorage)
    totalFiles += 2

    console.log(`  ${name}: ${totalFiles} files published\n`)
  }

  // Purge cache once at the end (all targets)
  const zoneId = process.env.CF_ZONE_ID
  const apiToken = process.env.CF_API_TOKEN
  if (zoneId && apiToken) {
    const { createCloudflarePurge } = await import('../publish-rendered.js')
    const purge = createCloudflarePurge(zoneId, apiToken)
    await purge.purgeAll()
    console.log(`  Cache purged\n`)
  }

  console.log(`  Done!\n`)
}

async function runDeploy(siteDir: string, targetName?: string) {
  const { execSync } = await import('node:child_process')
  const { writeFile, mkdir, rm } = await import('node:fs/promises')

  const siteYamlPath = join(siteDir, 'site.yaml')
  if (!existsSync(siteYamlPath)) {
    console.error(`\n  Error: No site.yaml found at ${siteDir}\n`)
    process.exit(1)
  }
  const siteYaml = yaml.load(readFileSync(siteYamlPath, 'utf-8')) as import('../types.js').SiteManifest
  if (!siteYaml.targets) {
    console.error(`\n  Error: No targets configured in site.yaml\n`)
    process.exit(1)
  }
  if (!targetName) {
    console.error(`\n  Error: --target is required for deploy\n  Usage: gazetta deploy -t <target-name>\n`)
    process.exit(1)
  }
  const target = siteYaml.targets[targetName]
  if (!target) {
    console.error(`\n  Error: Unknown target "${targetName}". Available: ${Object.keys(siteYaml.targets).join(', ')}\n`)
    process.exit(1)
  }
  if (!target.worker) {
    console.error(`\n  Error: Target "${targetName}" has no worker config. Add to site.yaml:\n\n  worker:\n    type: cloudflare\n    name: my-site\n`)
    process.exit(1)
  }
  if (target.worker.type !== 'cloudflare') {
    console.error(`\n  Error: Unsupported worker type "${target.worker.type}". Currently only "cloudflare" is supported.\n`)
    process.exit(1)
  }

  // Generate worker in temp dir
  const workerName = target.worker.name ?? targetName
  const bucketName = target.storage.bucket ?? workerName
  const tmpDir = join(siteDir, '.gazetta-deploy')
  await rm(tmpDir, { recursive: true, force: true })
  await mkdir(tmpDir, { recursive: true })

  // Generate wrangler.toml
  let wranglerToml = `name = "${workerName}"\nmain = "index.ts"\ncompatibility_date = "2024-12-01"\nworkers_dev = true\n\n[[r2_buckets]]\nbinding = "SITE_BUCKET"\nbucket_name = "${bucketName}"\n`

  // Add custom domain route if siteUrl is configured
  if (target.siteUrl) {
    const url = new URL(target.siteUrl)
    const hostname = url.hostname
    wranglerToml += `\n[[routes]]\npattern = "${hostname}/*"\nzone_name = "${hostname}"\n`
  }

  await writeFile(join(tmpDir, 'wrangler.toml'), wranglerToml)

  // Generate worker entry point
  const workerCode = `import { createWorker } from 'gazetta/workers/cloudflare-r2'\nexport default createWorker()\n`
  await writeFile(join(tmpDir, 'index.ts'), workerCode)

  // Generate package.json for wrangler
  const pkgJson = JSON.stringify({
    type: 'module',
    dependencies: { gazetta: '*', hono: '*' },
  })
  await writeFile(join(tmpDir, 'package.json'), pkgJson)

  // Install deps and deploy
  console.log(`  Deploying worker "${workerName}" to Cloudflare...`)
  try {
    execSync('npm install --install-links ' + resolve(import.meta.dirname, '../..'), { cwd: tmpDir, stdio: 'pipe' })
    const output = execSync('npx wrangler deploy', { cwd: tmpDir, stdio: 'pipe' }).toString()
    const urlMatch = output.match(/https:\/\/[^\s]+/)
    console.log(`  Worker deployed: ${urlMatch?.[0] ?? workerName}`)
    if (target.siteUrl) console.log(`  Site: ${target.siteUrl}`)
  } catch (err) {
    const stderr = (err as { stderr?: Buffer }).stderr?.toString() ?? (err as Error).message
    console.error(`\n  Deploy failed: ${stderr}\n`)
    process.exit(1)
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }

  console.log(`\n  Worker deployed. Now publish content:\n    gazetta publish -t ${targetName}\n`)
}

async function runValidate(siteDir: string) {
  const storage = createFilesystemProvider()

  console.log(`\n  Validating ${siteDir}...\n`)

  // 1. Check site.yaml
  let site: Awaited<ReturnType<typeof loadSite>>
  try {
    site = await loadSite(siteDir, storage)
    console.log(`  ✓ site.yaml — ${site.manifest.name}`)
  } catch (err) {
    console.error(`  ✗ site.yaml — ${(err as Error).message}`)
    process.exit(1)
  }

  let errors = 0

  // 2. Validate all fragments
  for (const [fragName, frag] of site.fragments) {
    try {
      const { resolveComponent } = await import('../resolver.js')
      const templatesDir = join(siteDir, 'templates')
      const ctx = { site, templatesDir, visited: new Set<string>(), path: [`@${fragName}`] }
      await resolveComponent(`@${fragName}`, '', ctx)

      const childCount = frag.components?.length ?? 0
      console.log(`  ✓ fragment: ${fragName} (${childCount} components)`)
    } catch (err) {
      console.error(`  ✗ fragment: ${fragName} — ${(err as Error).message}`)
      errors++
    }
  }

  // 3. Validate all pages
  for (const [pageName, page] of site.pages) {
    try {
      await resolvePage(pageName, site)

      const componentCount = page.components?.length ?? 0
      const fragmentCount = page.components?.filter(c => c.startsWith('@')).length ?? 0
      console.log(`  ✓ page: ${pageName} (${componentCount} components, ${fragmentCount} fragments)`)
    } catch (err) {
      console.error(`  ✗ page: ${pageName} — ${(err as Error).message}`)
      errors++
    }
  }

  // 4. List templates
  const templatesDir = join(siteDir, 'templates')
  try {
    const entries = await storage.readDir(templatesDir)
    const templateCount = entries.filter(e => e.isDirectory).length
    console.log(`  ✓ ${templateCount} templates found`)
  } catch {
    console.log(`  ⚠ templates/ directory not found`)
  }

  console.log()
  if (errors > 0) {
    console.error(`  ${errors} error${errors > 1 ? 's' : ''} found.\n`)
    process.exit(1)
  } else {
    console.log(`  All good.\n`)
  }
}

function renderErrorOverlay(err: Error): string {
  const message = err.message.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const stack = (err.stack ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // Extract file path from error message or stack
  const fileMatch = stack.match(/\(?(\/[^\s:)]+):(\d+)/)
  const filePath = fileMatch ? fileMatch[1] : ''
  const lineNum = fileMatch ? fileMatch[2] : ''
  const location = filePath ? `${filePath}${lineNum ? `:${lineNum}` : ''}` : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Error — Gazetta</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #1a1a2e; color: #e4e4e7; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .overlay { max-width: 48rem; width: 100%; margin: 2rem; }
    .header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem; }
    .header svg { flex-shrink: 0; }
    .header h1 { font-size: 1.25rem; font-weight: 600; color: #f87171; }
    .message { background: #0f0f1a; border: 1px solid #27272a; border-radius: 8px; padding: 1.5rem; margin-bottom: 1rem; font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.875rem; line-height: 1.7; white-space: pre-wrap; word-break: break-word; color: #fca5a5; }
    .location { font-size: 0.8125rem; color: #71717a; margin-bottom: 1rem; }
    .location span { color: #a78bfa; }
    .stack { background: #0f0f1a; border: 1px solid #27272a; border-radius: 8px; padding: 1.5rem; font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.75rem; line-height: 1.7; white-space: pre-wrap; word-break: break-word; color: #52525b; max-height: 20rem; overflow: auto; }
    .hint { margin-top: 1.5rem; font-size: 0.8125rem; color: #52525b; }
  </style>
</head>
<body>
  <div class="overlay">
    <div class="header">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <h1>Template Error</h1>
    </div>
    ${location ? `<div class="location">File: <span>${location}</span></div>` : ''}
    <div class="message">${message}</div>
    <details>
      <summary style="color:#52525b;font-size:0.8125rem;cursor:pointer;margin-bottom:0.5rem">Stack trace</summary>
      <div class="stack">${stack}</div>
    </details>
    <div class="hint">Fix the error and save — the page will reload automatically.</div>
  </div>
  <script>new EventSource('/__reload').onmessage = () => location.reload()</script>
</body>
</html>`
}

async function runDev(siteDir: string, port: number) {
  const storage = createFilesystemProvider()

  console.log(`\n  Loading site from ${siteDir}...`)
  const site = await loadSite(siteDir, storage)

  const app = new Hono()

  // ---- Live reload (SSE) ----
  let reloadId = 0
  const reloadListeners = new Set<() => void>()
  function notifyReload() { reloadId++; for (const l of reloadListeners) l() }

  const RELOAD_SCRIPT = `<script>new EventSource('/__reload').onmessage = () => location.reload()</script>`

  app.get('/__reload', (c) => {
    return streamSSE(c, async (stream) => {
      let lastId = reloadId
      const check = async () => {
        if (reloadId !== lastId) { lastId = reloadId; await stream.writeSSE({ data: 'reload', event: 'message' }) }
      }
      reloadListeners.add(check)
      stream.onAbort(() => { reloadListeners.delete(check) })
      while (true) { await stream.sleep(500); await check() }
    })
  })

  // ---- Site page routes ----
  for (const [pageName, page] of site.pages) {
    app.get(page.route, async (c) => {
      try {
        const freshSite = await loadSite(siteDir, storage)
        const resolved = await resolvePage(pageName, freshSite)
        const html = await renderPage(resolved, c.req.param())
        return c.html(html.replace('</body>', `${RELOAD_SCRIPT}\n</body>`))
      } catch (err) {
        return c.html(renderErrorOverlay(err as Error), 500)
      }
    })
  }

  // ---- Detect mode: dev (monorepo with apps/admin-ui source) vs production (pre-built) ----
  const cmsWebDir = findCmsDir()
  const cmsStaticDir = findCmsStaticDir()
  const isDevMode = cmsWebDir !== null

  if (isDevMode) {
    // Dev mode: proxy API to subprocess, Vite middleware for HMR
    await setupDevMode(app, siteDir, port, cmsWebDir!)
  } else if (cmsStaticDir) {
    // Production mode: inline CMS API + static files
    await setupProductionMode(app, siteDir, storage, cmsStaticDir)
  }

  // ---- 404 ----
  app.notFound((c) => {
    const routes = [...site.pages.entries()].map(([n, p]) => `  ${p.route} → ${n}`).join('\n')
    return c.html(`<pre style="padding:2rem">Page not found: ${c.req.path}\n\nAvailable:\n${routes}\n  /admin → CMS editor</pre>`, 404)
  })

  // ---- Start server ----
  let apiProc: ChildProcess | null = null

  if (isDevMode) {
    const apiPort = port + 100
    apiProc = spawn('npx', ['tsx', join(cmsWebDir!, 'src/server/dev.ts'), siteDir], {
      env: { ...process.env, API_PORT: String(apiPort) },
      stdio: 'pipe',
    })
    apiProc.stderr?.on('data', (d: Buffer) => {
      const msg = d.toString().trim()
      if (msg) console.error(`  [admin-api] ${msg}`)
    })
  }

  const nodeServer = serve({ fetch: app.fetch, port }, async () => {
    console.log(`\n  Gazetta running at http://localhost:${port}\n`)
    console.log(`  Site: ${site.manifest.name}`)
    console.log(`  Pages:`)
    for (const [name, page] of site.pages) console.log(`    ${page.route} → ${name}`)
    console.log(`  Fragments: ${[...site.fragments.keys()].join(', ') || '(none)'}`)

    if (isDevMode && cmsWebDir) {
      try {
        const { createServer: createViteServer } = await import('vite')
        const vite = await createViteServer({
          configFile: join(cmsWebDir, 'vite.config.ts'),
          root: cmsWebDir,
          base: '/admin/',
          server: {
            middlewareMode: true,
            hmr: { server: nodeServer as unknown as import('node:http').Server },
          },
        })

        const httpServer = nodeServer as unknown as import('node:http').Server
        const originalListeners = httpServer.listeners('request').slice()
        httpServer.removeAllListeners('request')

        const honoHandler = (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
          for (const listener of originalListeners) {
            (listener as (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void)(req, res)
          }
        }

        httpServer.on('request', (req, res) => {
          const url = req.url ?? ''
          if (url.startsWith('/admin/api') || url.startsWith('/admin/preview')) {
            honoHandler(req, res)
          } else if (url.startsWith('/admin') || url.startsWith('/@')) {
            vite.middlewares(req, res, () => honoHandler(req, res))
          } else {
            honoHandler(req, res)
          }
        })

        console.log(`  CMS:  http://localhost:${port}/admin (dev mode + HMR)`)
      } catch (err) {
        console.warn(`  Warning: CMS UI failed to start: ${(err as Error).message}`)
      }
    } else if (cmsStaticDir) {
      console.log(`  CMS:  http://localhost:${port}/admin`)
    }
    console.log()
  })

  // ---- Cleanup ----
  process.on('SIGINT', () => {
    apiProc?.kill()
    process.exit(0)
  })

  // ---- File watching ----
  watch(siteDir, { recursive: true }, (_event, filename) => {
    if (!filename) return
    if (filename.endsWith('.ts') && filename.includes('templates/')) {
      const parts = filename.split('/')
      const idx = parts.indexOf('templates')
      if (idx >= 0 && idx + 1 < parts.length) {
        console.log(`  Template changed: ${parts[idx + 1]}`)
        invalidateTemplate(parts[idx + 1])
      }
    } else if (filename.endsWith('.yaml')) {
      console.log(`  Manifest changed: ${filename}`)
      invalidateAllTemplates()
    } else return
    notifyReload()
  })
}

// ---- Dev mode: proxy /admin/api/* and /admin/preview/* to CMS API subprocess ----
async function setupDevMode(app: Hono, _siteDir: string, port: number, _cmsWebDir: string) {
  const apiPort = port + 100

  for (const prefix of ['/admin/api', '/admin/preview']) {
    app.all(`${prefix}/*`, async (c) => {
      try {
        const url = new URL(c.req.url)
        const path = url.pathname.replace('/admin', '')
        const targetUrl = `http://localhost:${apiPort}${path}${url.search}`
        const res = await fetch(targetUrl, {
          method: c.req.method,
          headers: c.req.raw.headers,
          body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
          // @ts-expect-error duplex needed for streaming body
          duplex: 'half',
        })
        return new Response(res.body, { status: res.status, headers: res.headers })
      } catch {
        return c.json({ error: 'CMS API not ready' }, 502)
      }
    })
  }
}

// ---- Production mode: inline CMS API + static files from admin-dist/ ----
async function setupProductionMode(app: Hono, siteDir: string, storage: ReturnType<typeof createFilesystemProvider>, cmsStaticDir: string) {
  // Read target configs from site.yaml — targets are initialized lazily on first publish/fetch
  const siteYamlPath = join(siteDir, 'site.yaml')
  let targetConfigs: Record<string, import('../types.js').TargetConfig> | undefined
  if (existsSync(siteYamlPath)) {
    const siteYaml = yaml.load(readFileSync(siteYamlPath, 'utf-8')) as SiteManifest
    targetConfigs = siteYaml.targets
  }

  // Mount CMS API inline at /admin
  const cmsApp = createAdminApp({ siteDir, storage, targetConfigs })
  app.route('/admin', cmsApp)

  // Serve pre-built CMS static files
  app.use('/admin/*', serveStatic({
    root: cmsStaticDir,
    rewriteRequestPath: (path) => path.replace(/^\/admin/, ''),
  }))

  // SPA fallback: serve index.html for unmatched /admin routes
  app.get('/admin/*', (c) => {
    const indexPath = join(cmsStaticDir, 'index.html')
    if (existsSync(indexPath)) {
      return c.html(readFileSync(indexPath, 'utf-8'))
    }
    return c.text('CMS admin UI not found', 404)
  })
  app.get('/admin', (c) => {
    const indexPath = join(cmsStaticDir, 'index.html')
    if (existsSync(indexPath)) {
      return c.html(readFileSync(indexPath, 'utf-8'))
    }
    return c.text('CMS admin UI not found', 404)
  })
}

/** Find apps/admin-ui source dir (monorepo dev mode) */
function findCmsDir(): string | null {
  const candidates = [
    resolve('apps/admin-ui'),
    resolve(import.meta.dirname, '../../../../apps/admin-ui'),
    resolve(import.meta.dirname, '../../../apps/admin-ui'),
  ]
  for (const dir of candidates) {
    if (existsSync(join(dir, 'src/server/dev.ts'))) return dir
  }
  return null
}

/** Find pre-built CMS static files (production mode) */
function findCmsStaticDir(): string | null {
  const candidates = [
    resolve(import.meta.dirname, '../../admin-dist'),
    resolve(import.meta.dirname, '../../../admin-dist'),
  ]
  for (const dir of candidates) {
    if (existsSync(join(dir, 'index.html'))) return dir
  }
  return null
}

async function main() {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp()
    process.exit(0)
  }

  const parsed = parseArgs(args.slice(1))

  switch (command) {
    case 'init':
      await runInit(args[1] ?? '.')
      break
    case 'publish':
      await runPublish(parsed.siteDir, parsed.target)
      break
    case 'deploy':
      await runDeploy(parsed.siteDir, parsed.target)
      break
    case 'validate':
      await runValidate(parsed.siteDir)
      break
    case 'dev':
      await runDev(parsed.siteDir, parsed.port ?? 3000)
      break
    default:
      console.error(`  Unknown command: ${command}\n`)
      printHelp()
      process.exit(1)
  }
}

main().catch((err) => {
  console.error(`\n  Error: ${(err as Error).message}\n`)
  process.exit(1)
})
