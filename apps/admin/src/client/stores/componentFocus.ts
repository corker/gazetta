import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useComponentFocusStore = defineStore('componentFocus', () => {
  /** gzId of the component being hovered in the tree → sent to bridge as gazetta:highlight */
  const highlightGzId = ref<string | null>(null)
  /** gzId of the component being hovered in the preview → highlights tree node */
  const previewHoverGzId = ref<string | null>(null)
  /** gzId of the selected (editing) component */
  const selectedGzId = ref<string | null>(null)
  /** gzId buffered during browse→edit transition (before ComponentTree mounts) */
  const pendingGzId = ref<string | null>(null)

  function highlight(gzId: string | null) {
    highlightGzId.value = gzId
  }
  function previewHover(gzId: string | null) {
    previewHoverGzId.value = gzId
  }
  function select(gzId: string | null) {
    selectedGzId.value = gzId
  }
  function setPending(gzId: string) {
    pendingGzId.value = gzId
  }
  function clearPending() {
    pendingGzId.value = null
  }

  return {
    highlightGzId,
    previewHoverGzId,
    selectedGzId,
    pendingGzId,
    highlight,
    previewHover,
    select,
    setPending,
    clearPending,
  }
})
