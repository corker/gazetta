<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useEditorStore } from '../stores/editor.js'

const editor = useEditorStore()
const iframeRef = ref<HTMLIFrameElement | null>(null)
const refreshKey = ref(0)

const previewUrl = computed(() => {
  if (!editor.previewRoute) return null
  return `/preview${editor.previewRoute}?_t=${refreshKey.value}`
})

// Refresh preview when saving completes
watch(() => editor.saving, (saving, wasSaving) => {
  if (wasSaving && !saving) refreshKey.value++
})
</script>

<template>
  <div class="preview-panel">
    <div v-if="!previewUrl" class="preview-empty">
      <p>Select a page to preview</p>
    </div>
    <iframe v-else ref="iframeRef" :src="previewUrl" class="preview-iframe" />
  </div>
</template>

<style scoped>
.preview-panel { height: 100%; display: flex; flex-direction: column; }
.preview-empty { padding: 1rem; color: #aaa; font-size: 0.875rem; }
.preview-iframe { flex: 1; width: 100%; border: 0; background: #fff; }
</style>
