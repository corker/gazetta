#!/usr/bin/env node

import { resolve, join } from 'node:path'
import { watch, existsSync } from 'node:fs'
import { spawn, type ChildProcess } from 'node:child_process'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import {
  loadSite, resolvePage, renderPage,
  createFilesystemProvider,
  invalidateTemplate, invalidateAllTemplates,
} from '../index.js'

const args = process.argv.slice(2)
const command = args[0]

function printHelp() {
  console.log(`
  gazetta - Stateless CMS for composable websites

  Usage:
    gazetta dev [site-dir]    Start dev server + CMS at /admin
    gazetta help              Show this help message

  Options:
    --port, -p <port>         Server port (default: 3000)

  Examples:
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
        const html = renderPage(resolved, page.metadata, c.req.param())
        return c.html(html.replace('</body>', `${RELOAD_SCRIPT}\n</body>`))
      } catch (err) {
        return c.html(`<pre style="color:red;padding:2rem">${(err as Error).message}</pre>`, 500)
      }
    })
  }

  // ---- CMS API proxy (/admin/api/*, /admin/preview/*) ----
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

  // ---- 404 ----
  app.notFound((c) => {
    const routes = [...site.pages.entries()].map(([n, p]) => `  ${p.route} → ${n}`).join('\n')
    return c.html(`<pre style="padding:2rem">Page not found: ${c.req.path}\n\nAvailable:\n${routes}\n  /admin → CMS editor</pre>`, 404)
  })

  // ---- Start CMS API (hidden port) ----
  let apiProc: ChildProcess | null = null
  const cmsWebDir = findCmsDir()

  if (cmsWebDir) {
    apiProc = spawn('npx', ['tsx', join(cmsWebDir, 'src/server/dev.ts'), siteDir], {
      env: { ...process.env, API_PORT: String(apiPort) },
      stdio: 'pipe',
    })
    apiProc.stderr?.on('data', (d: Buffer) => {
      const msg = d.toString().trim()
      if (msg) console.error(`  [cms-api] ${msg}`)
    })
  }

  // ---- Start Node server with Vite middleware ----
  const nodeServer = serve({ fetch: app.fetch, port }, async () => {
    console.log(`\n  Gazetta running at http://localhost:${port}\n`)
    console.log(`  Site: ${site.manifest.name}`)
    console.log(`  Pages:`)
    for (const [name, page] of site.pages) console.log(`    ${page.route} → ${name}`)
    console.log(`  Fragments: ${[...site.fragments.keys()].join(', ') || '(none)'}`)

    // Mount Vite middleware for /admin after server starts
    if (cmsWebDir) {
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

        // Attach Vite middleware to the Node server for /admin paths
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
          // API and preview routes go to Hono (which proxies to CMS API)
          if (url.startsWith('/admin/api') || url.startsWith('/admin/preview')) {
            honoHandler(req, res)
          // Vite handles CMS UI and its assets
          } else if (url.startsWith('/admin') || url.startsWith('/@')) {
            vite.middlewares(req, res, () => honoHandler(req, res))
          // Everything else (site pages) goes to Hono
          } else {
            honoHandler(req, res)
          }
        })

        console.log(`  CMS:  http://localhost:${port}/admin`)
      } catch (err) {
        console.warn(`  Warning: CMS UI failed to start: ${(err as Error).message}`)
      }
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

function findCmsDir(): string | null {
  const candidates = [
    resolve('apps/web'),
    resolve(import.meta.dirname, '../../../../apps/web'),
    resolve(import.meta.dirname, '../../../apps/web'),
  ]
  for (const dir of candidates) {
    if (existsSync(join(dir, 'src/server/dev.ts'))) return dir
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
