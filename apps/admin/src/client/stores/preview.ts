import { defineStore } from 'pinia'
import { ref } from 'vue'

export const usePreviewStore = defineStore('preview', () => {
  /** Bumped on structural changes (save, move, add, remove) — triggers full preview refetch */
  const version = ref(0)
  /** Bumped on content edits — triggers debounced preview refetch with draft overrides */
  const draftVersion = ref(0)

  function invalidate() { version.value++ }
  function invalidateDraft() { draftVersion.value++ }

  return { version, draftVersion, invalidate, invalidateDraft }
})
