import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useEditorPersistenceStore } from '../src/client/stores/editorPersistence.js'
import type { EditingTarget } from '../src/client/stores/editing.js'
import type { StashedEdit } from '../src/client/stores/editorStash.js'

function makeTarget(path: string, saveFn?: () => Promise<void>): EditingTarget {
  return {
    template: 'test-template',
    path,
    content: { original: true },
    schema: {},
    save: saveFn ?? (async () => {}),
  }
}

function makeStashed(path: string, saveFn?: () => Promise<void>): StashedEdit {
  return {
    target: makeTarget(path, saveFn),
    editedContent: { stashed: true, path },
  }
}

describe('editorPersistence', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('returns success when nothing to save', async () => {
    const store = useEditorPersistenceStore()
    const result = await store.save(null, [])
    expect(result).toEqual({ success: true })
    expect(store.saving).toBe(false)
  })

  it('saves the current edit', async () => {
    const saveFn = vi.fn(async () => {})
    const store = useEditorPersistenceStore()
    const result = await store.save({ target: makeTarget('hero', saveFn), content: { title: 'New' } }, [])
    expect(result).toEqual({ success: true })
    expect(saveFn).toHaveBeenCalledWith({ title: 'New' })
  })

  it('saves stashed edits', async () => {
    const saveFn1 = vi.fn(async () => {})
    const saveFn2 = vi.fn(async () => {})
    const store = useEditorPersistenceStore()
    const result = await store.save(null, [makeStashed('hero', saveFn1), makeStashed('footer', saveFn2)])
    expect(result).toEqual({ success: true })
    expect(saveFn1).toHaveBeenCalledWith({ stashed: true, path: 'hero' })
    expect(saveFn2).toHaveBeenCalledWith({ stashed: true, path: 'footer' })
  })

  it('saves current then stashed in order', async () => {
    const order: string[] = []
    const currentSave = vi.fn(async () => {
      order.push('current')
    })
    const stashedSave = vi.fn(async () => {
      order.push('stashed')
    })
    const store = useEditorPersistenceStore()
    await store.save({ target: makeTarget('hero', currentSave), content: {} }, [makeStashed('footer', stashedSave)])
    expect(order).toEqual(['current', 'stashed'])
  })

  it('sets saving flag during save', async () => {
    let savingDuringSave = false
    const slowSave = async () => {
      savingDuringSave = store.saving
    }
    const store = useEditorPersistenceStore()
    await store.save({ target: makeTarget('hero', slowSave), content: {} }, [])
    expect(savingDuringSave).toBe(true)
    expect(store.saving).toBe(false)
  })

  it('returns error on current save failure', async () => {
    const failSave = async () => {
      throw new Error('Network error')
    }
    const store = useEditorPersistenceStore()
    const result = await store.save({ target: makeTarget('hero', failSave), content: {} }, [])
    expect(result).toEqual({ success: false, error: 'Network error' })
    expect(store.lastSaveError).toBe('Network error')
    expect(store.saving).toBe(false)
  })

  it('returns error on stashed save failure', async () => {
    const okSave = vi.fn(async () => {})
    const failSave = async () => {
      throw new Error('Stash failed')
    }
    const store = useEditorPersistenceStore()
    const result = await store.save({ target: makeTarget('hero', okSave), content: {} }, [
      makeStashed('footer', failSave),
    ])
    expect(result).toEqual({ success: false, error: 'Stash failed' })
    expect(okSave).toHaveBeenCalled()
    expect(store.lastSaveError).toBe('Stash failed')
  })

  it('clears lastSaveError on next real save attempt', async () => {
    const store = useEditorPersistenceStore()
    await store.save(
      {
        target: makeTarget('hero', async () => {
          throw new Error('fail')
        }),
        content: {},
      },
      [],
    )
    expect(store.lastSaveError).toBe('fail')
    await store.save({ target: makeTarget('hero'), content: {} }, [])
    expect(store.lastSaveError).toBeNull()
  })
})
