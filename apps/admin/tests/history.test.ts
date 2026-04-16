/**
 * Integration tests for history-on-save and history-on-publish in the
 * admin-api. Uses a temp copy of the starter site so mutations don't
 * leak between runs — the existing api.test.ts mutates in place, which
 * is fine for single-item asserts but would clobber history state.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { cp, rm, readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Hono } from 'hono'
import {
  createFilesystemProvider,
  createSourceContext,
  createHistoryProvider,
  type SourceContext,
} from 'gazetta'
import { createAdminApp } from '../src/server/index.js'

const starterSiteDir = resolve(import.meta.dirname, '../../../examples/starter/sites/main')
const templatesDir = resolve(import.meta.dirname, '../../../examples/starter/templates')

/**
 * Spin up an isolated copy of the starter's local target. We snapshot
 * only the content root (sites/main/targets/local) since that's where
 * history writes. The app config points at the real templates.
 */
async function setupWorkingCopy(name: string) {
  const tempDir = resolve(import.meta.dirname, '../../../.tmp', name)
  await rm(tempDir, { recursive: true, force: true })
  await cp(resolve(starterSiteDir, 'targets/local'), tempDir, { recursive: true })
  return tempDir
}

describe('History on save', () => {
  let contentDir: string
  let app: Hono
  let source: SourceContext

  beforeAll(async () => {
    contentDir = await setupWorkingCopy('history-save-test')
    const storage = createFilesystemProvider(contentDir)
    const history = createHistoryProvider({ storage })
    source = createSourceContext({ storage, siteDir: '', projectSiteDir: starterSiteDir, history })
    app = createAdminApp({ source, siteDir: starterSiteDir, templatesDir })
  })

  afterAll(async () => {
    await rm(contentDir, { recursive: true, force: true })
  })

  it('records a revision on PUT /api/pages/:name', async () => {
    // First save — triggers the initial full-tree scan.
    const res = await app.request('/api/pages/home', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { title: 'Edited' } }),
    })
    expect(res.status).toBe(200)

    const indexPath = resolve(contentDir, '.gazetta/history/index.json')
    const index = JSON.parse(await readFile(indexPath, 'utf-8'))
    expect(index.revisions).toEqual(['rev-0001'])

    const manifestPath = resolve(contentDir, '.gazetta/history/revisions/rev-0001.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))
    expect(manifest.operation).toBe('save')
    // Full-tree baseline: every page + fragment manifest is captured,
    // not just the one that was saved.
    expect(Object.keys(manifest.snapshot).sort()).toEqual(expect.arrayContaining([
      'pages/home/page.json',
      'pages/about/page.json',
      'fragments/header/fragment.json',
      'fragments/footer/fragment.json',
    ]))
  })

  it('second save writes delta onto the previous snapshot', async () => {
    const res = await app.request('/api/pages/about', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { title: 'About edited' } }),
    })
    expect(res.status).toBe(200)

    const index = JSON.parse(await readFile(resolve(contentDir, '.gazetta/history/index.json'), 'utf-8'))
    expect(index.revisions).toEqual(['rev-0001', 'rev-0002'])
    const rev1 = JSON.parse(await readFile(resolve(contentDir, '.gazetta/history/revisions/rev-0001.json'), 'utf-8'))
    const rev2 = JSON.parse(await readFile(resolve(contentDir, '.gazetta/history/revisions/rev-0002.json'), 'utf-8'))
    // Unchanged items share blobs (same hash) across revisions.
    expect(rev2.snapshot['pages/home/page.json']).toBe(rev1.snapshot['pages/home/page.json'])
    // pages/about changed — different blob.
    expect(rev2.snapshot['pages/about/page.json']).not.toBe(rev1.snapshot['pages/about/page.json'])
  })

  it('records a revision on DELETE /api/pages/:name with the item removed from the snapshot', async () => {
    // Create a page so we can delete it cleanly.
    await app.request('/api/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '.history-delete-test', template: 'page-default' }),
    })
    const del = await app.request('/api/pages/.history-delete-test', { method: 'DELETE' })
    expect(del.status).toBe(200)

    const entries = await readdir(resolve(contentDir, '.gazetta/history/revisions'))
    const latest = entries.sort().at(-1)!
    const manifest = JSON.parse(
      await readFile(resolve(contentDir, '.gazetta/history/revisions', latest), 'utf-8'),
    )
    expect(manifest.snapshot).not.toHaveProperty('pages/.history-delete-test/page.json')
  })
})

describe('History disabled on save', () => {
  let contentDir: string
  let app: Hono

  beforeAll(async () => {
    contentDir = await setupWorkingCopy('history-disabled-test')
    const storage = createFilesystemProvider(contentDir)
    // No history provider → source.history is undefined → no revisions.
    const source = createSourceContext({ storage, siteDir: '', projectSiteDir: starterSiteDir })
    app = createAdminApp({ source, siteDir: starterSiteDir, templatesDir })
  })

  afterAll(async () => {
    await rm(contentDir, { recursive: true, force: true })
  })

  it('does not create .gazetta/history/ when the source has no history provider', async () => {
    const res = await app.request('/api/pages/home', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { title: 'Quiet save' } }),
    })
    expect(res.status).toBe(200)

    // Happy path — the history directory should not exist.
    await expect(
      readFile(resolve(contentDir, '.gazetta/history/index.json'), 'utf-8'),
    ).rejects.toThrow()
  })
})

describe('Retention', () => {
  let contentDir: string
  let app: Hono

  beforeAll(async () => {
    contentDir = await setupWorkingCopy('history-retention-test')
    const storage = createFilesystemProvider(contentDir)
    const history = createHistoryProvider({ storage, retention: 2 })
    const source = createSourceContext({ storage, siteDir: '', projectSiteDir: starterSiteDir, history })
    app = createAdminApp({ source, siteDir: starterSiteDir, templatesDir })
  })

  afterAll(async () => {
    await rm(contentDir, { recursive: true, force: true })
  })

  it('evicts oldest revisions once retention is hit', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await app.request('/api/pages/home', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: { title: `rev ${i}` } }),
      })
      expect(res.status).toBe(200)
    }
    const index = JSON.parse(await readFile(resolve(contentDir, '.gazetta/history/index.json'), 'utf-8'))
    // Only the two most recent ids remain in the index; older manifests
    // are deleted. nextId keeps climbing so restored ids never collide.
    expect(index.revisions).toEqual(['rev-0004', 'rev-0005'])
    expect(index.nextId).toBe(6)
    await expect(
      readFile(resolve(contentDir, '.gazetta/history/revisions/rev-0001.json'), 'utf-8'),
    ).rejects.toThrow()
  })
})

