import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, type PageSummary, type FragmentSummary, type SiteManifest } from '../api/client.js'

export const useSiteStore = defineStore('site', () => {
  const manifest = ref<SiteManifest | null>(null)
  const pages = ref<PageSummary[]>([])
  const fragments = ref<FragmentSummary[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  let loadPromise: Promise<void> | null = null

  async function ensureLoaded() {
    if (manifest.value && !error.value) return
    if (loadPromise) return loadPromise
    return load()
  }

  async function load(retries = 5) {
    if (loadPromise) return loadPromise
    loadPromise = doLoad(retries)
    return loadPromise
  }

  async function doLoad(retries = 5) {
    loading.value = true
    error.value = null
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const [site, pageList, fragmentList] = await Promise.all([
          api.getSite(),
          api.getPages(),
          api.getFragments(),
        ])
        manifest.value = site
        pages.value = pageList
        fragments.value = fragmentList
        loading.value = false
        return
      } catch (err) {
        const msg = (err as Error).message
        if (attempt < retries && (msg.includes('502') || msg.includes('Failed to fetch') || msg.includes('not ready'))) {
          await new Promise(r => setTimeout(r, 1000))
          continue
        }
        error.value = msg
      }
    }
    loading.value = false
    loadPromise = null
  }

  return { manifest, pages, fragments, loading, error, load, ensureLoaded }
})
