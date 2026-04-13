import { test as base, type Page } from '@playwright/test'
import { cp, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, type ChildProcess } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const starterDir = resolve(repoRoot, 'examples/starter')

interface TestSite {
  baseURL: string
  projectDir: string
}

/**
 * Worker-scoped fixture: each Playwright worker gets its own copy of the
 * starter site under `.tmp/e2e-{workerIdx}/project/`, with its own dev server
 * on port 3100+workerIdx. Tests never mutate the real repo.
 *
 * Override playwright's `baseURL` so `page.goto('/admin')` hits the worker's
 * server automatically.
 */
export const test = base.extend<{ page: Page }, { testSite: TestSite; baseURL: string }>({
  // Capture browser console + page errors. Logged to stderr on failure so it
  // shows up in CI logs directly (also attached as artifact). Helps diagnose #122.
  page: async ({ page }, use, testInfo) => {
    const logs: string[] = []
    page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`))
    page.on('pageerror', err => logs.push(`[pageerror] ${err.message}`))
    await use(page)
    if (testInfo.status !== testInfo.expectedStatus) {
      const body = logs.length ? logs.join('\n') : '(no browser logs captured)'
      process.stderr.write(`\n===== BROWSER CONSOLE for ${testInfo.title} =====\n${body}\n===== END =====\n`)
      await testInfo.attach('browser-console.log', { body, contentType: 'text/plain' })
    }
  },

  testSite: [async ({}, use, workerInfo) => {
    const workerDir = resolve(repoRoot, '.tmp', `e2e-${workerInfo.workerIndex}`)
    const projectDir = resolve(workerDir, 'project')
    const port = 3100 + workerInfo.workerIndex

    await rm(workerDir, { recursive: true, force: true })
    await mkdir(workerDir, { recursive: true })
    await cp(starterDir, projectDir, {
      recursive: true,
      filter: (src) => !src.includes('/dist') && !src.includes('/node_modules') && !src.includes('/.tmp'),
    })

    const server = spawnDev(projectDir, port)
    try {
      await waitForServer(port, server)
    } catch (err) {
      server.kill('SIGTERM')
      throw err
    }

    try {
      await use({ baseURL: `http://localhost:${port}`, projectDir })
    } finally {
      server.kill('SIGTERM')
      await new Promise<void>(resolveP => server.once('exit', () => resolveP()))
      // Always clean — Playwright preserves test-results/ for debugging separately
      await rm(workerDir, { recursive: true, force: true }).catch(() => {})
    }
  }, { scope: 'worker' }],

  // Override baseURL so every page.goto('/...') lands on the worker's server
  baseURL: async ({ testSite }, use) => {
    await use(testSite.baseURL)
  },
})

function spawnDev(cwd: string, port: number): ChildProcess {
  const cli = resolve(repoRoot, 'packages/gazetta/src/cli/index.ts')
  // Use the project's node_modules (which includes tsx + jiti via gazetta package)
  const tsxBin = resolve(repoRoot, 'node_modules/.bin/tsx')
  if (!existsSync(tsxBin)) throw new Error(`tsx not found at ${tsxBin}; run 'npm install' at repo root`)
  return spawn(tsxBin, [cli, 'dev', 'sites/main', '--port', String(port)], {
    cwd,
    env: { ...process.env, CI: 'true', NO_COLOR: '1' }, // CI=true avoids the interactive publish confirm
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

/**
 * Poll the server's /admin route until it responds 200 (or timeout).
 * If the child process exits before ready, surface the stderr so the test fails
 * with an actionable error instead of a mystery timeout.
 */
async function waitForServer(port: number, server: ChildProcess): Promise<void> {
  const timeoutMs = 30000
  const started = Date.now()
  let stderr = ''
  server.stderr?.on('data', (d) => { stderr += d.toString() })

  const exitPromise = new Promise<never>((_, reject) => {
    server.once('exit', (code) => {
      reject(new Error(`gazetta dev exited prematurely (code ${code}) before serving /admin\n${stderr}`))
    })
  })

  while (Date.now() - started < timeoutMs) {
    try {
      const res = await Promise.race([
        fetch(`http://localhost:${port}/admin`),
        exitPromise,
      ])
      if (res && res.status === 200) break
    } catch {
      // still starting — retry
    }
    await new Promise(r => setTimeout(r, 100))
  }
  if (Date.now() - started >= timeoutMs) {
    throw new Error(`gazetta dev on port ${port} did not become ready within ${timeoutMs}ms\n${stderr}`)
  }

}

export { expect } from '@playwright/test'
