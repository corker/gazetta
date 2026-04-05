<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useEditorStore } from '../stores/editor.js'
import { useEditorMount } from '../composables/useEditorMount.js'
import { createEditorMount } from '@gazetta/editor-default'
import type { EditorMount } from '@gazetta/shared'

const editor = useEditorStore()
const containerRef = ref<HTMLElement | null>(null)

const editorMountRef = computed<EditorMount | null>(() => {
  if (!editor.templateSchema) return null
  return createEditorMount(editor.templateSchema)
})

const contentRef = computed(() => editor.componentContent)

function handleChange(content: Record<string, unknown>) {
  editor.componentContent = content
}

useEditorMount(containerRef, editorMountRef, contentRef, handleChange)
</script>

<template>
  <div class="editor-panel">
    <div v-if="!editor.selectedComponentPath" class="editor-empty">
      <p>Select a component to edit</p>
    </div>
    <div v-else>
      <h3>{{ editor.componentTemplate }}</h3>
      <div ref="containerRef" class="editor-container" />
    </div>
  </div>
</template>

<style scoped>
.editor-panel h3 { font-size: 0.75rem; text-transform: uppercase; color: #888; margin-bottom: 1rem; letter-spacing: 0.05em; }
.editor-empty { color: #aaa; font-size: 0.875rem; }
.editor-container { font-size: 0.875rem; }
</style>
