import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useEditingStore } from './editing.js'
import { useComponentFocusStore } from './componentFocus.js'

export type UiMode = 'browse' | 'edit' | 'fullscreen'

export const useUiModeStore = defineStore('uiMode', () => {
  const mode = ref<UiMode>('browse')
  let previousMode: UiMode = 'browse'

  function enterEdit() {
    mode.value = 'edit'
  }

  /** Caller must check editing.dirty and confirm before calling this */
  function enterBrowse() {
    useEditingStore().clear()
    const focus = useComponentFocusStore()
    focus.select(null)
    focus.clearPending()
    mode.value = 'browse'
  }

  function toggleFullscreen() {
    if (mode.value === 'fullscreen') {
      mode.value = previousMode
    } else {
      previousMode = mode.value as 'browse' | 'edit'
      mode.value = 'fullscreen'
    }
  }

  return { mode, enterEdit, enterBrowse, toggleFullscreen }
})
