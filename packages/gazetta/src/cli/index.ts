#!/usr/bin/env node

import { resolve, join } from 'node:path'
import { watch, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
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
    gazetta dev [site-dir]    Start dev server with CMS at /admin
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
  const cmsApiPort = port + 100
  const cmsUiPort = port + 101

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

  // ---- Proxy /api/* and /preview/* to CMS API server ----
  app.all('/api/*', async (c) => {
    try {
      const url = new URL(c.req.url)
      url.port = String(cmsApiPort)
      const res = await fetch(url.toString(), {
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

  app.all('/preview/*', async (c) => {
    try {
      const url = new URL(c.req.url)
      url.port = String(cmsApiPort)
      const res = await fetch(url.toString(), {
        method: c.req.method,
        headers: c.req.raw.headers,
        body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
        // @ts-expect-error duplex needed for streaming body
        duplex: 'half',
      })
      return new Response(res.body, { status: res.status, headers: res.headers })
    } catch {
      return c.text('Preview not ready', 502)
    }
  })

  // ---- Proxy /admin to Vite dev server ----
  app.all('/admin', async (c) => {
    try {
      const res = await fetch(`http://localhost:${cmsUiPort}/`)
      return new Response(res.body, { status: res.status, headers: res.headers })
    } catch {
      return c.html('<p>CMS UI loading... <a href="/admin">refresh</a></p>')
    }
  })

  app.all('/admin/*', async (c) => {
    try {
      const path = new URL(c.req.url).pathname.replace('/admin', '') || '/'
      const res = await fetch(`http://localhost:${cmsUiPort}${path}`)
      return new Response(res.body, { status: res.status, headers: res.headers })
    } catch {
      // Fall through to Vite's SPA routing
      try {
        const res = await fetch(`http://localhost:${cmsUiPort}/`)
        return new Response(res.body, { status: res.status, headers: res.headers })
      } catch {
        return c.html('<p>CMS UI loading... <a href="/admin">refresh</a></p>')
      }
    }
  })

  // ---- Proxy Vite assets (/@vite, /src, /node_modules) ----
  for (const prefix of ['/@vite', '/@fs', '/@id', '/src/client', '/node_modules']) {
    app.all(`${prefix}/*`, async (c) => {
      try {
        const path = new URL(c.req.url).pathname
        const res = await fetch(`http://localhost:${cmsUiPort}${path}`)
        return new Response(res.body, { status: res.status, headers: res.headers })
      } catch {
        return c.text('Not ready', 502)
      }
    })
  }

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

  // ---- 404 ----
  app.notFound((c) => {
    const routes = [...site.pages.entries()].map(([n, p]) => `  ${p.route} → ${n}`).join('\n')
    return c.html(`<pre style="padding:2rem">Page not found: ${c.req.path}\n\nAvailable:\n${routes}\n  /admin → CMS editor</pre>`, 404)
  })

  // ---- Start CMS API server (hidden port) ----
  const cmsWebDir = findCmsDir()
  if (cmsWebDir) {
    const apiProc = spawn('npx', ['tsx', join(cmsWebDir, 'src/server/dev.ts'), siteDir], {
      env: { ...process.env, API_PORT: String(cmsApiPort) },
      stdio: 'pipe',
    })
    apiProc.stderr?.on('data', (d: Buffer) => {
      const msg = d.toString().trim()
      if (msg) console.error(`  [cms-api] ${msg}`)
    })

    // Start Vite for CMS UI (hidden port)
    const viteProc = spawn('npx', ['vite', '--port', String(cmsUiPort), '--strictPort'], {
      cwd: cmsWebDir,
      env: { ...process.env, VITE_PORT: String(cmsUiPort), VITE_HMR_PORT: String(cmsUiPort), API_PORT: String(cmsApiPort) },
      stdio: 'pipe',
    })
    viteProc.stderr?.on('data', (d: Buffer) => {
      const msg = d.toString().trim()
      if (msg && !msg.includes('VITE')) console.error(`  [cms-ui] ${msg}`)
    })

    process.on('exit', () => { apiProc.kill(); viteProc.kill() })
    process.on('SIGINT', () => { apiProc.kill(); viteProc.kill(); process.exit(0) })
  }

  // ---- Start main server ----
  serve({ fetch: app.fetch, port }, () => {
    console.log(`\n  Gazetta running at http://localhost:${port}\n`)
    console.log(`  Site: ${site.manifest.name}`)
    console.log(`  Pages:`)
    for (const [name, page] of site.pages) console.log(`    ${page.route} → ${name}`)
    if (cmsWebDir) console.log(`  CMS:  http://localhost:${port}/admin`)
    console.log()
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
