/**
 * Unit tests for restoreRevision. Exercises:
 *   - Writing blob content back at snapshot paths
 *   - Deleting items present today but absent from the target revision
 *   - Recording a forward revision with operation='rollback' + restoredFrom
 *   - Soft undo invariant: every restore appends, nothing is destroyed
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { StorageProvider } from '../src/types.js'
import { createContentRoot } from '../src/content-root.js'
import { createHistoryProvider } from '../src/history-provider.js'
import { recordWrite } from '../src/history-recorder.js'
import { restoreRevision } from '../src/history-restorer.js'

function memoryStorage(): StorageProvider & {
  dump(): Map<string, string>
  seed(entries: Record<string, string>): void
} {
  const files = new Map<string, string>()
  return {
    async readFile(path) {
      const v = files.get(path)
      if (v === undefined) throw new Error(`ENOENT: ${path}`)
      return v
    },
    async writeFile(path, content) {
      files.set(path, content)
    },
    async exists(path) {
      return files.has(path)
    },
    async readDir(path) {
      const prefix = path.endsWith('/') ? path : path + '/'
      const dirs = new Set<string>()
      const f = new Set<string>()
      for (const p of files.keys()) {
        if (!p.startsWith(prefix)) continue
        const rest = p.slice(prefix.length)
        const seg = rest.split('/')[0]
        if (!seg) continue
        if (rest.includes('/')) dirs.add(seg)
        else f.add(seg)
      }
      return [
        ...[...dirs].map(name => ({ name, isDirectory: true, isFile: false })),
        ...[...f].filter(n => !dirs.has(n)).map(name => ({ name, isDirectory: false, isFile: true })),
      ]
    },
    async mkdir() {},
    async rm(path) {
      files.delete(path)
      const prefix = path.endsWith('/') ? path : path + '/'
      for (const p of [...files.keys()]) {
        if (p.startsWith(prefix)) files.delete(p)
      }
    },
    dump() {
      return files
    },
    seed(entries) {
      for (const [k, v] of Object.entries(entries)) files.set(k, v)
    },
  }
}

describe('restoreRevision', () => {
  let storage: ReturnType<typeof memoryStorage>
  beforeEach(() => {
    storage = memoryStorage()
  })

  // recordWrite emits a baseline on the first call, so the ordering is:
  //   baseline (pre-write scan), first save, second save, ...
  // "Restore the first save" = "undo the second save".
  it("writes the target revision's snapshot back to the content tree", async () => {
    storage.seed({
      'pages/home/page.json': 'v1',
      'pages/about/page.json': 'unchanged',
    })
    const history = createHistoryProvider({ storage })
    const contentRoot = createContentRoot(storage)

    const firstSave = await recordWrite({
      history,
      contentRoot,
      operation: 'save',
      items: [{ path: 'pages/home/page.json', content: 'v1' }],
    })
    storage.seed({ 'pages/home/page.json': 'v2' })
    await recordWrite({
      history,
      contentRoot,
      operation: 'save',
      items: [{ path: 'pages/home/page.json', content: 'v2' }],
    })

    // Restore to the first-save revision — back to v1.
    const restored = await restoreRevision({ history, contentRoot, revisionId: firstSave.id })

    expect(restored.operation).toBe('rollback')
    expect(restored.restoredFrom).toBe(firstSave.id)
    expect(await storage.readFile('pages/home/page.json')).toBe('v1')
    expect(await storage.readFile('pages/about/page.json')).toBe('unchanged')
  })

  it('deletes items present today but absent from the restored snapshot', async () => {
    storage.seed({
      'pages/home/page.json': 'v1',
    })
    const history = createHistoryProvider({ storage })
    const contentRoot = createContentRoot(storage)

    // First recordWrite emits baseline + first save. pages/new doesn't
    // exist yet, so the first save's snapshot contains only pages/home.
    const firstSave = await recordWrite({
      history,
      contentRoot,
      operation: 'save',
      items: [{ path: 'pages/home/page.json', content: 'v1' }],
    })
    // Author adds pages/new — next save captures both.
    storage.seed({ 'pages/new/page.json': 'new-content' })
    await recordWrite({
      history,
      contentRoot,
      operation: 'save',
      items: [{ path: 'pages/new/page.json', content: 'new-content' }],
    })

    // Restore the first-save revision → pages/new should be removed.
    await restoreRevision({ history, contentRoot, revisionId: firstSave.id })

    expect(await storage.exists('pages/home/page.json')).toBe(true)
    expect(await storage.exists('pages/new/page.json')).toBe(false)
  })

  it('records a new forward revision (soft undo)', async () => {
    storage.seed({ 'pages/home/page.json': 'v1' })
    const history = createHistoryProvider({ storage })
    const contentRoot = createContentRoot(storage)
    const firstSave = await recordWrite({
      history,
      contentRoot,
      operation: 'save',
      items: [{ path: 'pages/home/page.json', content: 'v1' }],
    })
    storage.seed({ 'pages/home/page.json': 'v2' })
    await recordWrite({
      history,
      contentRoot,
      operation: 'save',
      items: [{ path: 'pages/home/page.json', content: 'v2' }],
    })

    const restored = await restoreRevision({ history, contentRoot, revisionId: firstSave.id })
    expect(restored.operation).toBe('rollback')

    // Full list: baseline + 2 saves + rollback = 4 revisions; nothing destroyed.
    const list = await history.listRevisions()
    expect(list).toHaveLength(4)
    expect(list[0].id).toBe(restored.id) // head = the rollback we just recorded
  })

  it('passes through author + message on the forward revision', async () => {
    storage.seed({ 'pages/home/page.json': 'v1' })
    const history = createHistoryProvider({ storage })
    const contentRoot = createContentRoot(storage)
    await recordWrite({
      history,
      contentRoot,
      operation: 'save',
      items: [{ path: 'pages/home/page.json', content: 'v1' }],
    })
    storage.seed({ 'pages/home/page.json': 'v2' })
    await recordWrite({
      history,
      contentRoot,
      operation: 'save',
      items: [{ path: 'pages/home/page.json', content: 'v2' }],
    })

    // Restore the baseline (oldest) with custom author + message.
    const list = await history.listRevisions()
    const baselineId = list[list.length - 1].id
    const restored = await restoreRevision({
      history,
      contentRoot,
      revisionId: baselineId,
      author: 'alice',
      message: 'Undo typo fix',
    })
    expect(restored.author).toBe('alice')
    expect(restored.message).toBe('Undo typo fix')
  })

  it('skips writes for items whose content already matches the restored snapshot', async () => {
    // Two items; only pages/home differs between revisions. pages/about
    // stays the same.
    storage.seed({
      'pages/home/page.json': 'home-v1',
      'pages/about/page.json': 'about-same',
    })
    const history = createHistoryProvider({ storage })
    const contentRoot = createContentRoot(storage)

    const firstSave = await recordWrite({
      history,
      contentRoot,
      operation: 'save',
      items: [{ path: 'pages/home/page.json', content: 'home-v1' }],
    })
    storage.seed({ 'pages/home/page.json': 'home-v2' })
    await recordWrite({
      history,
      contentRoot,
      operation: 'save',
      items: [{ path: 'pages/home/page.json', content: 'home-v2' }],
    })

    // Instrument writeFile to count invocations during restore.
    const origWrite = storage.writeFile
    let writeCount = 0
    storage.writeFile = async (p, c) => {
      // Ignore history-internal writes (blobs + manifest + index) —
      // they're part of the forward revision, not the content tree
      // restore we're checking.
      if (!p.startsWith('.gazetta/')) writeCount += 1
      return origWrite.call(storage, p, c)
    }

    await restoreRevision({ history, contentRoot, revisionId: firstSave.id })

    // Only pages/home needed to change — pages/about's hash matches
    // the current head so the restorer should skip it.
    expect(writeCount).toBe(1)
    expect(await storage.readFile('pages/home/page.json')).toBe('home-v1')
    expect(await storage.readFile('pages/about/page.json')).toBe('about-same')
  })

  it('restoring the head is a no-op delete + a forward revision with identical snapshot', async () => {
    storage.seed({ 'pages/home/page.json': 'v1' })
    const history = createHistoryProvider({ storage })
    const contentRoot = createContentRoot(storage)
    const head = await recordWrite({
      history,
      contentRoot,
      operation: 'save',
      items: [{ path: 'pages/home/page.json', content: 'v1' }],
    })

    // Restoring the current head is a valid no-op — content stays put
    // but history still appends a rollback revision (forward-only).
    const restored = await restoreRevision({ history, contentRoot, revisionId: head.id })
    expect(restored.operation).toBe('rollback')
    expect(await storage.readFile('pages/home/page.json')).toBe('v1')
    const list = await history.listRevisions()
    expect(list).toHaveLength(3) // baseline + save + rollback
    expect(list[0].id).toBe(restored.id)
  })
})
