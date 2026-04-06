<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useEditorStore } from '../stores/editor.js'

const editor = useEditorStore()
const previewHtml = ref<string | null>(null)
const loading = ref(false)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
const previewPath = computed(() => {
  if (!editor.previewRoute) return null
  return `${basePath}/preview${editor.previewRoute}`
})

// Fetch preview HTML (GET for saved state, POST for draft state)
async function fetchPreview() {
  if (!previewPath.value) { previewHtml.value = null; return }
  loading.value = true
  try {
    const hasDraft = editor.dirty && editor.selectedComponentPath && editor.componentContent
    let res: Response
    if (hasDraft) {
      const overrides: Record<string, Record<string, unknown>> = {}
      overrides[editor.selectedComponentPath!] = editor.componentContent!
      res = await fetch(previewPath.value, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides }),
      })
    } else {
      res = await fetch(previewPath.value)
    }
    previewHtml.value = await res.text()
  } catch {
    previewHtml.value = '<pre style="color:red;padding:2rem">Failed to load preview</pre>'
  } finally {
    loading.value = false
  }
}

function debouncedFetchPreview() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(fetchPreview, 300)
}

// Refresh on page selection or after save
watch(() => editor.previewVersion, fetchPreview)
watch(previewPath, fetchPreview, { immediate: true })

// Live refresh on draft edits (debounced)
watch(() => editor.draftVersion, debouncedFetchPreview)
</script>

<template>
  <div class="preview-panel" data-testid="preview-panel">
    <div v-if="!previewPath" class="preview-empty" data-testid="preview-empty">
      <i class="pi pi-eye" style="font-size: 2rem; color: #ddd; margin-bottom: 0.5rem;" />
      <p>Select a page to preview</p>
    </div>
    <iframe v-else :srcdoc="previewHtml ?? ''" class="preview-iframe" data-testid="preview-iframe" />
  </div>
</template>

<style scoped>
.preview-panel { height: 100%; display: flex; flex-direction: column; }
.preview-empty { padding: 1rem; color: #aaa; font-size: 0.875rem; display: flex; flex-direction: column; align-items: center; padding-top: 3rem; }
.preview-iframe { flex: 1; width: 100%; border: 0; background: #fff; }
</style>
