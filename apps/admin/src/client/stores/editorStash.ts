import { defineStore } from 'pinia'
import { reactive, computed } from 'vue'
import type { EditingTarget } from './editorContent.js'

export interface StashedEdit {
  target: EditingTarget
  editedContent: Record<string, unknown>
}

/**
 * Multi-document edit buffer. Stores pending edits when the user switches
 * between components without saving. Each entry maps a component path to
 * its editing target and dirty content.
 *
 * Pure state — no side effects, no store dependencies.
 */
export const useEditorStashStore = defineStore('editorStash', () => {
  const entries = reactive<Map<string, StashedEdit>>(new Map())

  function stash(path: string, target: EditingTarget, editedContent: Record<string, unknown>) {
    entries.set(path, { target, editedContent })
  }

  /** Remove and return stashed edit, or null if not found. */
  function restore(path: string): StashedEdit | null {
    const entry = entries.get(path) ?? null
    if (entry) entries.delete(path)
    return entry
  }

  function has(path: string): boolean {
    return entries.has(path)
  }

  function revert(path: string) {
    entries.delete(path)
  }

  function clearAll() {
    entries.clear()
  }

  /** Iterator over stashed entries — used by save to persist all pending edits. */
  function values(): IterableIterator<StashedEdit> {
    return entries.values()
  }

  const size = computed(() => entries.size)

  return { entries, stash, restore, has, revert, clearAll, values, size }
})
