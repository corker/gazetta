import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, type PageDetail, type FragmentDetail } from '../api/client.js'
import { useToastStore } from './toast.js'
import { usePreviewStore } from './preview.js'

export type Selection =
  | { type: 'page'; name: string; detail: PageDetail }
  | { type: 'fragment'; name: string; detail: FragmentDetail }

export const useSelectionStore = defineStore('selection', () => {
  const toast = useToastStore()

  const selection = ref<Selection | null>(null)

  // Convenience accessors
  const type = computed(() => selection.value?.type ?? null)
  const name = computed(() => selection.value?.name ?? null)
  const detail = computed(() => selection.value?.detail ?? null)
  const previewRoute = computed(() => {
    if (selection.value?.type === 'page') return selection.value.detail.route
    return null
  })

  async function selectPage(pageName: string) {
    try {
      const detail = await api.getPage(pageName)
      selection.value = { type: 'page', name: pageName, detail }
      usePreviewStore().invalidate()
    } catch (err) {
      toast.showError(err, `Failed to load page "${pageName}"`)
    }
  }

  async function selectFragment(fragName: string) {
    try {
      const detail = await api.getFragment(fragName)
      selection.value = { type: 'fragment', name: fragName, detail }
    } catch (err) {
      toast.showError(err, `Failed to load fragment "${fragName}"`)
    }
  }

  /** Refresh the current selection's detail from the server */
  async function reload() {
    if (!selection.value) return
    try {
      if (selection.value.type === 'page') {
        const detail = await api.getPage(selection.value.name)
        selection.value = { type: 'page', name: selection.value.name, detail }
      } else {
        const detail = await api.getFragment(selection.value.name)
        selection.value = { type: 'fragment', name: selection.value.name, detail }
      }
    } catch (err) {
      toast.showError(err, 'Failed to reload')
    }
  }

  /** Update the component list (after move/add/remove) and refresh */
  async function updateComponents(components: string[]) {
    if (!selection.value) return
    try {
      if (selection.value.type === 'page') {
        await api.updatePage(selection.value.name, { components })
      } else {
        await api.updateFragment(selection.value.name, { components })
      }
      await reload()
      usePreviewStore().invalidate()
    } catch (err) {
      toast.showError(err, 'Failed to update components')
    }
  }

  return { selection, type, name, detail, previewRoute, selectPage, selectFragment, reload, updateComponents }
})
