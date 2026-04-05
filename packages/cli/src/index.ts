#!/usr/bin/env node

import { resolve } from 'node:path'
import { watch } from 'node:fs'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { loadSite, resolvePage, renderPage, createFilesystemProvider, invalidateTemplate, invalidateAllTemplates } from '@gazetta/renderer'

const args = process.argv.slice(2)
const command = args[0]

function printHelp() {
  console.log(`
  gazetta - Stateless CMS for composable websites

  Usage:
    gazetta dev [site-dir]    Start the dev server
    gazetta help              Show this help message

  Options:
    --port, -p <port>         Server port (default: 3000)

  Examples:
    gazetta dev                     # dev server for current directory
    gazetta dev ./my-site           # dev server for a specific site
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

  app.notFound((c) => {
    const routes = [...site.pages.entries()].map(([n, p]) => `  ${p.route} → ${n}`).join('\n')
    return c.html(`<pre style="padding:2rem">Page not found: ${c.req.path}\n\nAvailable:\n${routes}</pre>`, 404)
  })

  serve({ fetch: app.fetch, port }, () => {
    console.log(`\n  Gazetta dev server running at http://localhost:${port}\n`)
    console.log(`  Site: ${site.manifest.name}`)
    for (const [name, page] of site.pages) console.log(`    ${page.route} → ${name}`)
    console.log(`  Fragments: ${[...site.fragments.keys()].join(', ') || '(none)'}\n`)
  })

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
    } else {
      return
    }
    notifyReload()
  })
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
