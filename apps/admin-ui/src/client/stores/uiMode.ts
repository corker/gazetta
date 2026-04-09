import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useEditingStore } from './editing.js'

export type UiMode = 'browse' | 'edit'
export type BridgeMode = 'browse' | 'edit' | 'fullscreen'

export const useUiModeStore = defineStore('uiMode', () => {
  const mode = ref<UiMode>('browse')
  const fullscreen = ref(false)

  const bridgeMode = computed<BridgeMode>(() => {
    if (fullscreen.value) return 'fullscreen'
    return mode.value
  })

  function enterEdit() {
    mode.value = 'edit'
  }

  /** Caller must check editing.dirty and confirm before calling this */
  function enterBrowse() {
    useEditingStore().clear()
    mode.value = 'browse'
  }

  function toggleFullscreen() {
    fullscreen.value = !fullscreen.value
  }

  return { mode, fullscreen, bridgeMode, enterEdit, enterBrowse, toggleFullscreen }
})
