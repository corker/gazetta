import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useEditorStashStore } from '../src/client/stores/editorStash.js'
import type { EditingTarget } from '../src/client/stores/editing.js'

function makeTarget(path: string, content: Record<string, unknown> = {}): EditingTarget {
  return {
    template: 'test-template',
    path,
    content,
    schema: {},
    save: async () => {},
  }
}

describe('editorStash', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('stashes and restores an edit', () => {
    const stash = useEditorStashStore()
    const target = makeTarget('hero', { title: 'Hello' })
    stash.stash('hero', target, { title: 'Modified' })

    expect(stash.has('hero')).toBe(true)
    expect(stash.size).toBe(1)

    const restored = stash.restore('hero')
    expect(restored).not.toBeNull()
    expect(restored!.editedContent).toEqual({ title: 'Modified' })
    expect(restored!.target).toEqual(target)

    expect(stash.has('hero')).toBe(false)
    expect(stash.size).toBe(0)
  })

  it('returns null when restoring non-existent path', () => {
    const stash = useEditorStashStore()
    expect(stash.restore('nonexistent')).toBeNull()
  })

  it('reverts a stashed edit without returning it', () => {
    const stash = useEditorStashStore()
    stash.stash('hero', makeTarget('hero'), { title: 'Draft' })
    stash.revert('hero')
    expect(stash.has('hero')).toBe(false)
    expect(stash.size).toBe(0)
  })

  it('revert is safe on non-existent path', () => {
    const stash = useEditorStashStore()
    stash.revert('nonexistent')
    expect(stash.size).toBe(0)
  })

  it('clears all stashed edits', () => {
    const stash = useEditorStashStore()
    stash.stash('hero', makeTarget('hero'), { a: 1 })
    stash.stash('footer', makeTarget('footer'), { b: 2 })
    stash.stash('_root', makeTarget('_root'), { c: 3 })
    expect(stash.size).toBe(3)

    stash.clearAll()
    expect(stash.size).toBe(0)
    expect(stash.has('hero')).toBe(false)
  })

  it('overwrites existing stash for same path', () => {
    const stash = useEditorStashStore()
    stash.stash('hero', makeTarget('hero'), { title: 'v1' })
    stash.stash('hero', makeTarget('hero'), { title: 'v2' })
    expect(stash.size).toBe(1)

    const restored = stash.restore('hero')
    expect(restored!.editedContent).toEqual({ title: 'v2' })
  })

  it('iterates values for save', () => {
    const stash = useEditorStashStore()
    stash.stash('hero', makeTarget('hero'), { a: 1 })
    stash.stash('footer', makeTarget('footer'), { b: 2 })

    const contents: Record<string, unknown>[] = []
    for (const entry of stash.values()) contents.push(entry.editedContent)
    expect(contents).toEqual([{ a: 1 }, { b: 2 }])
  })

  it('has() returns false after restore', () => {
    const stash = useEditorStashStore()
    stash.stash('hero', makeTarget('hero'), { a: 1 })
    stash.restore('hero')
    expect(stash.has('hero')).toBe(false)
  })
})
