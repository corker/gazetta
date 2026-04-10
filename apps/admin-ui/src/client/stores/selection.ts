import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, type PageDetail, type FragmentDetail, type PageSummary } from '../api/client.js'
import { useToastStore } from './toast.js'
import { usePreviewStore } from './preview.js'
import { useSiteStore } from './site.js'

export type Selection =
  | { type: 'page'; name: string; detail: PageDetail }
  | { type: 'fragment'; name: string; detail: FragmentDetail }

const STORAGE_KEY = 'gazetta_selection'

function saveSession(data: { type: string; name: string; hostPage?: string } | null) {
  if (data) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  else sessionStorage.removeItem(STORAGE_KEY)
}

export const useSelectionStore = defineStore('selection', () => {
  const toast = useToastStore()

  const selection = ref<Selection | null>(null)
  const fragmentHostPage = ref<PageSummary | null>(null)

  // Convenience accessors
  const type = computed(() => selection.value?.type ?? null)
  const name = computed(() => selection.value?.name ?? null)
  const detail = computed(() => selection.value?.detail ?? null)

  /** Pages with static routes (no :params) — usable as fragment preview hosts */
  const staticPages = computed(() => useSiteStore().pages.filter(p => !p.route.includes(':')))

  const previewRoute = computed(() => {
    if (selection.value?.type === 'page') return selection.value.detail.route
    if (selection.value?.type === 'fragment') {
      if (fragmentHostPage.value) return fragmentHostPage.value.route
      return `/@${selection.value.name}`
    }
    return null
  })

  function resolveDefaultHostPage() {
    const pages = staticPages.value
    fragmentHostPage.value = pages.find(p => p.route === '/') ?? pages[0] ?? null
  }

  function setFragmentHostPage(pageName: string) {
    const page = staticPages.value.find(p => p.name === pageName)
    if (page) {
      fragmentHostPage.value = page
      if (selection.value?.type === 'fragment') {
        saveSession({ type: 'fragment', name: selection.value.name, hostPage: pageName })
      }
      usePreviewStore().invalidate()
    }
  }

  async function selectPage(pageName: string) {
    try {
      const detail = await api.getPage(pageName)
      selection.value = { type: 'page', name: pageName, detail }
      fragmentHostPage.value = null
      saveSession({ type: 'page', name: pageName })
      usePreviewStore().invalidate()
    } catch (err) {
      toast.showError(err, `Failed to load page "${pageName}"`)
    }
  }

  async function selectFragment(fragName: string) {
    try {
      const detail = await api.getFragment(fragName)
      selection.value = { type: 'fragment', name: fragName, detail }
      resolveDefaultHostPage()
      saveSession({ type: 'fragment', name: fragName, hostPage: fragmentHostPage.value?.name })
      usePreviewStore().invalidate()
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

  /** Restore selection from sessionStorage (call after site data is loaded) */
  async function restore() {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
      const saved = JSON.parse(raw) as { type: string; name: string; hostPage?: string }
      if (saved.type === 'page') {
        const detail = await api.getPage(saved.name)
        if (selection.value) return // User already clicked something
        selection.value = { type: 'page', name: saved.name, detail }
        fragmentHostPage.value = null
        usePreviewStore().invalidate()
      } else if (saved.type === 'fragment') {
        const detail = await api.getFragment(saved.name)
        if (selection.value) return // User already clicked something
        selection.value = { type: 'fragment', name: saved.name, detail }
        // Restore host page if saved, otherwise default
        if (saved.hostPage) {
          const page = staticPages.value.find(p => p.name === saved.hostPage)
          if (page) fragmentHostPage.value = page
          else resolveDefaultHostPage()
        } else {
          resolveDefaultHostPage()
        }
        usePreviewStore().invalidate()
      }
    } catch {
      sessionStorage.removeItem(STORAGE_KEY)
    }
  }

  return { selection, type, name, detail, previewRoute, fragmentHostPage, staticPages, selectPage, selectFragment, setFragmentHostPage, reload, updateComponents, restore }
})
