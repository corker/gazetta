<script setup lang="ts">
import { ref, computed } from 'vue'
import { onKeyStroke } from '@vueuse/core'
import { useEditingStore } from '../stores/editing.js'
import { useThemeStore } from '../stores/theme.js'
import { useEditorMount } from '../composables/useEditorMount.js'
import { createEditorMount } from 'gazetta/editor'
import type { EditorMount } from 'gazetta/types'

const editing = useEditingStore()
const theme = useThemeStore()
const containerRef = ref<HTMLElement | null>(null)

const hasProperties = computed(() => {
  const s = editing.schema as Record<string, unknown> | null
  if (!s) return false
  const props = s.properties as Record<string, unknown> | undefined
  return props && Object.keys(props).length > 0
})

const editorMountRef = computed<EditorMount | null>(() => {
  if (!editing.schema || !hasProperties.value) return null
  // Use custom editor if loaded, otherwise default @rjsf form
  if (editing.customEditorMount) return editing.customEditorMount
  return createEditorMount(editing.schema)
})

const contentRef = computed(() => editing.content)
const schemaRef = computed(() => editing.schema as Record<string, unknown> | null)
const themeRef = computed<'dark' | 'light'>(() => theme.dark ? 'dark' : 'light')
const mountVersionRef = computed(() => editing.mountVersion)
const fieldsBaseUrlRef = computed(() => editing.target?.fieldsBaseUrl)

function handleChange(content: Record<string, unknown>) {
  editing.markDirty(content)
}

useEditorMount(containerRef, editorMountRef, contentRef, schemaRef, themeRef, handleChange, mountVersionRef, fieldsBaseUrlRef)

// Ctrl+S / Cmd+S to save
onKeyStroke('s', (e) => {
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault()
    if (editing.dirty) editing.save()
  }
})

// Theme CSS variables — set on the editor container for React editor to consume
const themeVars = computed(() => {
  if (theme.dark) {
    return {
      '--gz-bg-input': '#161622',
      '--gz-bg-card': '#1a1a28',
      '--gz-bg-toolbar': '#1a1a2a',
      '--gz-bg-chip': '#252538',
      '--gz-bg-code': '#12121e',
      '--gz-text': '#e0e0e0',
      '--gz-text-secondary': '#ccc',
      '--gz-text-label': '#8888a0',
      '--gz-text-hint': '#444',
      '--gz-border': '#2a2a3a',
      '--gz-border-subtle': '#1e1e2e',
      '--gz-accent': '#667eea',
      '--gz-error': '#f87171',
      '--gz-success': '#4ade80',
    }
  }
  return {
    '--gz-bg-input': '#ffffff',
    '--gz-bg-card': '#f9fafb',
    '--gz-bg-toolbar': '#f3f4f6',
    '--gz-bg-chip': '#e5e7eb',
    '--gz-bg-code': '#f1f5f9',
    '--gz-text': '#1a1a1a',
    '--gz-text-secondary': '#4b5563',
    '--gz-text-label': '#6b7280',
    '--gz-text-hint': '#9ca3af',
    '--gz-border': '#e5e7eb',
    '--gz-border-subtle': '#f3f4f6',
    '--gz-accent': '#667eea',
    '--gz-error': '#dc2626',
    '--gz-success': '#16a34a',
  }
})
</script>

<template>
  <div class="editor-panel" data-testid="editor-panel" :style="themeVars">
    <div v-if="!editing.path" class="editor-empty" data-testid="editor-empty">
      <i class="pi pi-pencil" style="font-size: 2rem; opacity: 0.3; margin-bottom: 0.5rem;" />
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
.editor-panel h3 { font-size: 0.75rem; text-transform: uppercase; color: var(--gz-text-label); margin-bottom: 1rem; letter-spacing: 0.05em; }
.editor-empty { color: var(--gz-text-hint); font-size: 0.875rem; display: flex; flex-direction: column; align-items: center; padding-top: 3rem; }
.editor-container { font-size: 0.875rem; }
.editor-no-schema { color: var(--gz-text-hint); font-size: 0.875rem; }
</style>
