import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { EditingTarget } from './editorContent.js'
import type { StashedEdit } from './editorStash.js'

export interface SaveResult {
  success: boolean
  error?: string
}

/**
 * Save orchestration — persists the current edit and all stashed edits
 * by calling each target's save function.
 *
 * Pure orchestration — no side effects (no toasts, no preview invalidation).
 * The caller decides what to do with the result.
 */
export const useEditorPersistenceStore = defineStore('editorPersistence', () => {
  const saving = ref(false)
  const lastSaveError = ref<string | null>(null)

  /**
   * Persist the current edit and all stashed edits.
   *
   * Calls each target's save function sequentially. Returns success/error.
   * On success, the caller is responsible for clearing stash and updating
   * the saved baseline.
   */
  async function save(
    current: { target: EditingTarget; content: Record<string, unknown> } | null,
    stashedEdits: StashedEdit[],
  ): Promise<SaveResult> {
    if (!current && stashedEdits.length === 0) return { success: true }
    saving.value = true
    lastSaveError.value = null
    try {
      if (current) await current.target.save(current.content)
      for (const entry of stashedEdits) await entry.target.save(entry.editedContent)
      return { success: true }
    } catch (err) {
      const message = (err as Error).message
      lastSaveError.value = message
      return { success: false, error: message }
    } finally {
      saving.value = false
    }
  }

  return { saving, lastSaveError, save }
})
