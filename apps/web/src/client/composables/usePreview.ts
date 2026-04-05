import { ref, watch, type Ref } from 'vue'

export function usePreview(route: Ref<string | null>, trigger: Ref<number>) {
  const previewUrl = ref<string | null>(null)

  watch([route, trigger], ([r, t]) => {
    previewUrl.value = r ? `/preview${r}?_t=${t}` : null
  }, { immediate: true })

  return { previewUrl }
}
