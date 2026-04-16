/**
 * Unit tests for createHistoryProvider. Uses an in-memory StorageProvider
 * so we exercise the real layout logic (index.json, revisions/, objects/
 * sharding) without touching disk.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { StorageProvider } from '../src/types.js'
import { createHistoryProvider } from '../src/history-provider.js'
import type { RevisionInput } from '../src/history.js'

/**
 * Bare-minimum in-memory storage. Mirrors filesystem semantics: reads
 * of missing paths throw; exists returns false; writes to nested paths
 * are fine (no mkdir needed since it's a flat Map keyed by full path).
 */
function memoryStorage(): StorageProvider & { dump(): Map<string, string> } {
  const files = new Map<string, string>()
  return {
    async readFile(path: string): Promise<string> {
      const v = files.get(path)
      if (v === undefined) throw new Error(`ENOENT: ${path}`)
      return v
    },
    async writeFile(path: string, content: string): Promise<void> {
      files.set(path, content)
    },
    async exists(path: string): Promise<boolean> {
      return files.has(path)
    },
    async readDir(path: string) {
      const prefix = path.endsWith('/') ? path : path + '/'
      const children = new Set<string>()
      for (const p of files.keys()) {
        if (!p.startsWith(prefix)) continue
        const rest = p.slice(prefix.length)
        const seg = rest.split('/')[0]
        if (seg) children.add(seg)
      }
      return [...children].map(name => ({ name, isDirectory: false, isFile: true }))
    },
    async mkdir(): Promise<void> { /* no-op; memoryStorage is flat */ },
    async rm(path: string): Promise<void> {
      files.delete(path)
      // Also handle dir deletes — remove everything under the prefix.
      const prefix = path.endsWith('/') ? path : path + '/'
      for (const p of [...files.keys()]) {
        if (p.startsWith(prefix)) files.delete(p)
      }
    },
    dump() { return files },
  }
}

function input(
  items: Record<string, string>,
  overrides: Partial<RevisionInput> = {},
): RevisionInput {
  return {
    operation: 'save',
    items: new Map(Object.entries(items)),
    ...overrides,
  }
}

describe('createHistoryProvider', () => {
  let storage: ReturnType<typeof memoryStorage>
  beforeEach(() => { storage = memoryStorage() })

  describe('recordRevision', () => {
    it('assigns sequential ids (rev-0001, rev-0002, ...)', async () => {
      const h = createHistoryProvider({ storage })
      const r1 = await h.recordRevision(input({ 'pages/home': 'a' }))
      const r2 = await h.recordRevision(input({ 'pages/home': 'b' }))
      expect(r1.id).toBe('rev-0001')
      expect(r2.id).toBe('rev-0002')
    })

    it('writes a manifest per revision under revisions/', async () => {
      const h = createHistoryProvider({ storage })
      await h.recordRevision(input({ 'pages/home': 'a' }))
      expect(await storage.exists('.gazetta/history/revisions/rev-0001.json')).toBe(true)
    })

    it('stores items as content-addressed blobs (sharded by first 2 hex chars)', async () => {
      const h = createHistoryProvider({ storage })
      await h.recordRevision(input({ 'pages/home': 'hello' }))
      // sha256('hello') = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
      const shardedPath = '.gazetta/history/objects/2c/f24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
      expect(await storage.exists(shardedPath)).toBe(true)
      expect(await storage.readFile(shardedPath)).toBe('hello')
    })

    it('dedupes unchanged content across revisions (writes blob only once)', async () => {
      const h = createHistoryProvider({ storage })
      await h.recordRevision(input({ 'pages/home': 'same', 'pages/about': 'same' }))
      await h.recordRevision(input({ 'pages/home': 'same', 'pages/about': 'changed' }))
      // Two unique contents → two blobs, not four.
      const blobs = [...storage.dump().keys()].filter(k => k.startsWith('.gazetta/history/objects/'))
      expect(blobs).toHaveLength(2)
    })

    it('returns the recorded Revision metadata (without the snapshot)', async () => {
      const h = createHistoryProvider({ storage })
      const rev = await h.recordRevision(input(
        { 'pages/home': 'a' },
        { operation: 'publish', source: 'local', message: 'hotfix' },
      ))
      expect(rev).toMatchObject({
        id: 'rev-0001',
        operation: 'publish',
        source: 'local',
        message: 'hotfix',
        items: ['pages/home'],
      })
      expect(rev).not.toHaveProperty('snapshot')
      expect(rev.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('sorts item paths deterministically in the manifest', async () => {
      const h = createHistoryProvider({ storage })
      await h.recordRevision(input({ 'pages/z': 'z', 'pages/a': 'a', 'pages/m': 'm' }))
      const manifest = JSON.parse(
        await storage.readFile('.gazetta/history/revisions/rev-0001.json'),
      )
      expect(manifest.items).toEqual(['pages/a', 'pages/m', 'pages/z'])
      expect(Object.keys(manifest.snapshot)).toEqual(['pages/a', 'pages/m', 'pages/z'])
    })
  })

  describe('listRevisions', () => {
    it('returns revisions newest-first', async () => {
      const h = createHistoryProvider({ storage })
      await h.recordRevision(input({ a: '1' }))
      await h.recordRevision(input({ a: '2' }))
      await h.recordRevision(input({ a: '3' }))
      const list = await h.listRevisions()
      expect(list.map(r => r.id)).toEqual(['rev-0003', 'rev-0002', 'rev-0001'])
    })

    it('honors the limit parameter', async () => {
      const h = createHistoryProvider({ storage })
      for (let i = 0; i < 5; i++) await h.recordRevision(input({ a: `${i}` }))
      const list = await h.listRevisions(2)
      expect(list).toHaveLength(2)
      expect(list[0].id).toBe('rev-0005')
    })

    it('empty when no revisions exist yet', async () => {
      const h = createHistoryProvider({ storage })
      expect(await h.listRevisions()).toEqual([])
    })
  })

  describe('readRevision', () => {
    it('returns the full manifest with snapshot', async () => {
      const h = createHistoryProvider({ storage })
      await h.recordRevision(input({ 'pages/home': 'a', 'pages/about': 'b' }))
      const m = await h.readRevision('rev-0001')
      expect(m.items).toEqual(['pages/about', 'pages/home'])
      expect(Object.keys(m.snapshot).sort()).toEqual(['pages/about', 'pages/home'])
    })
  })

  describe('readBlob', () => {
    it('returns the content for a given hash', async () => {
      const h = createHistoryProvider({ storage })
      await h.recordRevision(input({ 'pages/home': 'hello' }))
      const m = await h.readRevision('rev-0001')
      const content = await h.readBlob(m.snapshot['pages/home'])
      expect(content).toBe('hello')
    })
  })

  describe('retention', () => {
    it('keeps only the most recent N revisions (default 50)', async () => {
      const h = createHistoryProvider({ storage, retention: 3 })
      for (let i = 0; i < 5; i++) await h.recordRevision(input({ a: `${i}` }))
      const list = await h.listRevisions()
      expect(list.map(r => r.id)).toEqual(['rev-0005', 'rev-0004', 'rev-0003'])
    })

    it('evicts manifests but keeps nextId monotonic', async () => {
      const h = createHistoryProvider({ storage, retention: 2 })
      await h.recordRevision(input({ a: '1' }))
      await h.recordRevision(input({ a: '2' }))
      await h.recordRevision(input({ a: '3' })) // evicts rev-0001
      expect(await storage.exists('.gazetta/history/revisions/rev-0001.json')).toBe(false)
      expect(await storage.exists('.gazetta/history/revisions/rev-0002.json')).toBe(true)
      // Next revision should still advance the counter — never reuse rev-0001.
      const r4 = await h.recordRevision(input({ a: '4' }))
      expect(r4.id).toBe('rev-0004')
    })

    it('clamps retention <= 0 to 1 (disable via history.enabled instead)', async () => {
      const h = createHistoryProvider({ storage, retention: 0 })
      await h.recordRevision(input({ a: '1' }))
      await h.recordRevision(input({ a: '2' }))
      const list = await h.listRevisions()
      expect(list).toHaveLength(1)
      expect(list[0].id).toBe('rev-0002')
    })
  })

  describe('deleteRevision', () => {
    it('removes the manifest and drops from the index', async () => {
      const h = createHistoryProvider({ storage })
      await h.recordRevision(input({ a: '1' }))
      await h.recordRevision(input({ a: '2' }))
      await h.deleteRevision('rev-0001')
      expect(await storage.exists('.gazetta/history/revisions/rev-0001.json')).toBe(false)
      const list = await h.listRevisions()
      expect(list.map(r => r.id)).toEqual(['rev-0002'])
    })

    it('no-op for unknown id', async () => {
      const h = createHistoryProvider({ storage })
      await h.recordRevision(input({ a: '1' }))
      await h.deleteRevision('rev-9999') // should not throw
      const list = await h.listRevisions()
      expect(list).toHaveLength(1)
    })
  })

  describe('rootPath option', () => {
    it('stores history under the provided path', async () => {
      const h = createHistoryProvider({ storage, rootPath: 'custom/path' })
      await h.recordRevision(input({ a: '1' }))
      expect(await storage.exists('custom/path/index.json')).toBe(true)
      expect(await storage.exists('custom/path/revisions/rev-0001.json')).toBe(true)
    })
  })
})
