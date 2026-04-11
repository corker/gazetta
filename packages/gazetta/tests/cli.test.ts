import { describe, it, expect } from 'vitest'
import { resolve, join } from 'node:path'
import { existsSync } from 'node:fs'

// Test the helper functions from the CLI by extracting the logic
// Since the CLI is a script with side effects, we test the pure functions

describe('parseArgs', () => {
  // Inline the parseArgs logic for testing
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

  it('defaults to current dir', () => {
    const { siteDir, port } = parseArgs([])
    expect(siteDir).toBe(resolve('.'))
    expect(port).toBeUndefined()
  })

  it('parses site dir', () => {
    const { siteDir } = parseArgs(['./my-site'])
    expect(siteDir).toBe(resolve('./my-site'))
  })

  it('parses --port flag', () => {
    const { port } = parseArgs(['--port', '8080'])
    expect(port).toBe(8080)
  })

  it('parses -p shorthand', () => {
    const { port } = parseArgs(['-p', '4000'])
    expect(port).toBe(4000)
  })

  it('parses site dir with port', () => {
    const { siteDir, port } = parseArgs(['./site', '--port', '9000'])
    expect(siteDir).toBe(resolve('./site'))
    expect(port).toBe(9000)
  })

  it('parses port before site dir', () => {
    const { siteDir, port } = parseArgs(['-p', '3001', './site'])
    expect(siteDir).toBe(resolve('./site'))
    expect(port).toBe(3001)
  })
})

describe('findCmsDir (dev mode detection)', () => {
  function findCmsDir(): string | null {
    const candidates = [
      resolve('apps/admin'),
      resolve(import.meta.dirname, '../../../../apps/admin'),
      resolve(import.meta.dirname, '../../../apps/admin'),
    ]
    for (const dir of candidates) {
      if (existsSync(join(dir, 'src/server/dev.ts'))) return dir
    }
    return null
  }

  it('finds admin dir in monorepo', () => {
    const dir = findCmsDir()
    expect(dir).not.toBeNull()
    expect(dir).toContain('apps/admin')
  })
})

describe('renderErrorOverlay', () => {
  // Inline the function for testing
  function renderErrorOverlay(err: Error): string {
    const message = err.message.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const stack = (err.stack ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const fileMatch = stack.match(/\(?(\/[^\s:)]+):(\d+)/)
    const filePath = fileMatch ? fileMatch[1] : ''
    const lineNum = fileMatch ? fileMatch[2] : ''
    const location = filePath ? `${filePath}${lineNum ? `:${lineNum}` : ''}` : ''
    return `<!DOCTYPE html><html><head><title>Error — Gazetta</title></head><body>${location ? `<div class="location">${location}</div>` : ''}<div class="message">${message}</div><script>new EventSource('/__reload').onmessage = () => location.reload()</script></body></html>`
  }

  it('renders error message with HTML escaping', () => {
    const html = renderErrorOverlay(new Error('Missing <template> export'))
    expect(html).toContain('Missing &lt;template&gt; export')
    expect(html).not.toContain('<template>')
  })

  it('includes live reload script', () => {
    const html = renderErrorOverlay(new Error('test'))
    expect(html).toContain('/__reload')
  })

  it('extracts file location from stack', () => {
    const err = new Error('bad')
    err.stack = `Error: bad\n    at Object.<anonymous> (/Users/dev/templates/hero/index.ts:5:10)`
    const html = renderErrorOverlay(err)
    expect(html).toContain('/Users/dev/templates/hero/index.ts:5')
  })
})

describe('findCmsStaticDir (production mode detection)', () => {
  function findCmsStaticDir(): string | null {
    const candidates = [
      resolve(import.meta.dirname, '../admin-dist'),
      resolve(import.meta.dirname, '../../admin-dist'),
    ]
    for (const dir of candidates) {
      if (existsSync(join(dir, 'index.html'))) return dir
    }
    return null
  }

  it('finds admin-dist when built', () => {
    const dir = findCmsStaticDir()
    // May or may not exist depending on whether build:admin has been run
    if (existsSync(resolve(import.meta.dirname, '../admin-dist/index.html'))) {
      expect(dir).not.toBeNull()
      expect(dir).toContain('admin-dist')
    } else {
      expect(dir).toBeNull()
    }
  })
})
