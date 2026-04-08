<script setup lang="ts">
import { ref, computed } from 'vue'
import { useEditingStore } from '../stores/editing.js'
import { useEditorMount } from '../composables/useEditorMount.js'
import { createEditorMount } from 'gazetta/editor'
import type { EditorMount } from 'gazetta/types'

const editing = useEditingStore()
const containerRef = ref<HTMLElement | null>(null)

const hasProperties = computed(() => {
  const s = editing.schema as Record<string, unknown> | null
  if (!s) return false
  const props = s.properties as Record<string, unknown> | undefined
  return props && Object.keys(props).length > 0
})

const editorMountRef = computed<EditorMount | null>(() => {
  if (!editing.schema || !hasProperties.value) return null
  return createEditorMount(editing.schema)
})

const contentRef = computed(() => editing.content)

function handleChange(content: Record<string, unknown>) {
  editing.markDirty(content)
}

useEditorMount(containerRef, editorMountRef, contentRef, handleChange)
</script>

<template>
  <div class="editor-panel" data-testid="editor-panel">
    <div v-if="!editing.path" class="editor-empty" data-testid="editor-empty">
      <i class="pi pi-pencil" style="font-size: 2rem; color: #ddd; margin-bottom: 0.5rem;" />
      <p>Select a component to edit</p>
    </div>
    <div v-else>
      <h3>{{ editing.template }}</h3>
      <div v-if="hasProperties" ref="containerRef" class="editor-container" data-testid="editor-container" :key="editing.path" />
      <p v-else class="editor-no-schema">No editable content. Edit its children instead.</p>
    </div>
  </div>
</template>

<style scoped>
.editor-panel h3 { font-size: 0.75rem; text-transform: uppercase; color: #888; margin-bottom: 1rem; letter-spacing: 0.05em; }
.editor-empty { color: #aaa; font-size: 0.875rem; display: flex; flex-direction: column; align-items: center; padding-top: 3rem; }
.editor-container { font-size: 0.875rem; }
.editor-no-schema { color: #71717a; font-size: 0.875rem; }
</style>
