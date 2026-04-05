<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '../stores/editor.js'

const editor = useEditorStore()

const previewUrl = computed(() => {
  if (!editor.previewRoute) return null
  return `/preview${editor.previewRoute}?_v=${editor.previewVersion}`
})
</script>

<template>
  <div class="preview-panel">
    <div v-if="!previewUrl" class="preview-empty">
      <i class="pi pi-eye" style="font-size: 2rem; color: #ddd; margin-bottom: 0.5rem;" />
      <p>Select a page to preview</p>
    </div>
    <iframe v-else :src="previewUrl" class="preview-iframe" />
  </div>
</template>

<style scoped>
.preview-panel { height: 100%; display: flex; flex-direction: column; }
.preview-empty { padding: 1rem; color: #aaa; font-size: 0.875rem; display: flex; flex-direction: column; align-items: center; padding-top: 3rem; }
.preview-iframe { flex: 1; width: 100%; border: 0; background: #fff; }
</style>
