import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, type PageSummary, type FragmentSummary, type SiteManifest } from '../api/client.js'

export const useSiteStore = defineStore('site', () => {
  const manifest = ref<SiteManifest | null>(null)
  const pages = ref<PageSummary[]>([])
  const fragments = ref<FragmentSummary[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      const [site, pageList, fragmentList] = await Promise.all([
        api.getSite(),
        api.getPages(),
        api.getFragments(),
      ])
      manifest.value = site
      pages.value = pageList
      fragments.value = fragmentList
    } catch (err) {
      error.value = (err as Error).message
    } finally {
      loading.value = false
    }
  }

  return { manifest, pages, fragments, loading, error, load }
})
