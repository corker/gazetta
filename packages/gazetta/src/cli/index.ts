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
    gazetta help              Show this help message

  Options:
    --port, -p <port>         Server port (default: 3000)

  Examples:
    gazetta init my-site            # scaffold a new site
    gazetta dev                     # dev server + CMS
    gazetta dev ./my-site           # specific site directory
    gazetta dev --port 8080         # custom port
`)
}

function parseArgs(input: string[]): { siteDir: string; port?: number } {
  let siteDir = '.'
  let port: number | undefined
  for (let i = 0; i < input.length; i++) {
    if (input[i] === '--port' || input[i] === '-p') {
      port = parseInt(input[++i], 10)
    } else if (!input[i].startsWith('-')) {
      siteDir = input[i]
    }
  }
  return { siteDir: resolve(siteDir), port }
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

export const schema = z.object({})

const template: TemplateFunction = ({ children = [] }) => ({
  html: \`<main>\${children.map(c => c.html).join('\\n')}</main>\`,
  css: \`main { max-width: 800px; margin: 0 auto; padding: 2rem; font-family: system-ui, sans-serif; }
\${children.map(c => c.css).join('\\n')}\`,
  js: children.map(c => c.js).filter(Boolean).join('\\n'),
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

    'pages/home/page.yaml': `route: /
template: page-layout
metadata:
  title: ${name}
components:
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

    'fragments/.gitkeep': '',

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
        const html = await renderPage(resolved, page.metadata, c.req.param())
        return c.html(html.replace('</body>', `${RELOAD_SCRIPT}\n</body>`))
      } catch (err) {
        return c.html(`<pre style="color:red;padding:2rem">${(err as Error).message}</pre>`, 500)
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
