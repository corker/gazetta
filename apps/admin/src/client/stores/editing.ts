function deepClone<T>(obj: T): T { return JSON.parse(JSON.stringify(obj)) }

import { defineStore } from 'pinia'
import { ref, computed, onUnmounted, watch } from 'vue'
import { useToastStore } from './toast.js'
import { usePreviewStore } from './preview.js'
import type { EditorMount } from 'gazetta/types'

export interface EditingTarget {
  /** Display label (template name) */
  template: string
  /** Filesystem path (used by preview for content overrides) */
  path: string
  /** Content to edit */
  content: Record<string, unknown>
  /** JSON Schema for form generation */
  schema: Record<string, unknown>
  /** Whether a custom editor exists for this template */
  hasEditor?: boolean
  /** URL to load the custom editor from (Vite /@fs/ path in dev) */
  editorUrl?: string
  /** Base URL for loading custom field modules (Vite /@fs/ path in dev) */
  fieldsBaseUrl?: string
  /** Persists edited content to the correct API endpoint */
  save: (content: Record<string, unknown>) => Promise<void>
}

export const useEditingStore = defineStore('editing', () => {
  const toast = useToastStore()

  const target = ref<EditingTarget | null>(null)
  const content = ref<Record<string, unknown> | null>(null)
  const saved = ref<Record<string, unknown> | null>(null)
  const saving = ref(false)
  const lastSaveError = ref<string | null>(null)
  /** Bumped on open/discard to trigger editor re-mount */
  const mountVersion = ref(0)
  /** Custom editor mount (loaded dynamically when template has one) */
  const customEditorMount = ref<EditorMount | null>(null)

  // Convenience accessors
  const template = computed(() => target.value?.template ?? null)
  const path = computed(() => target.value?.path ?? null)
  const schema = computed(() => target.value?.schema ?? null)
  const dirty = computed(() => {
    if (!content.value || !saved.value) return false
    return JSON.stringify(content.value) !== JSON.stringify(saved.value)
  })

  async function open(t: EditingTarget) {
    target.value = t
    content.value = deepClone(t.content)
    saved.value = deepClone(t.content)
    saving.value = false
    lastSaveError.value = null
    customEditorMount.value = null

    // Load custom editor if available
    if (t.hasEditor && t.editorUrl) {
      try {
        const mod = await import(/* @vite-ignore */ t.editorUrl)
        customEditorMount.value = (mod.default ?? mod) as EditorMount
      } catch (err) {
        console.warn(`Custom editor for "${t.template}" failed to load:`, err)
      }
    }

    mountVersion.value++
    usePreviewStore().invalidateDraft()
  }

  function clear() {
    target.value = null
    content.value = null
    saved.value = null
    saving.value = false
    lastSaveError.value = null
  }

  // Warn on browser close/refresh with unsaved changes
  const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
    if (dirty.value) { e.preventDefault(); e.returnValue = '' }
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', beforeUnloadHandler)
  }

  function markDirty(newContent: Record<string, unknown>) {
    content.value = newContent
    usePreviewStore().invalidateDraft()
  }

  function discard() {
    if (saved.value) {
      content.value = deepClone(saved.value)
      mountVersion.value++
      usePreviewStore().invalidateDraft()
    }
  }

  async function save() {
    if (!target.value || !content.value) return
    saving.value = true
    lastSaveError.value = null
    try {
      await target.value.save(content.value)
      saved.value = deepClone(content.value)
      usePreviewStore().invalidate()
      toast.show('Saved')
    } catch (err) {
      lastSaveError.value = (err as Error).message
      toast.showError(err, 'Failed to save')
    } finally {
      saving.value = false
    }
  }

  return { target, content, saved, saving, lastSaveError, template, path, schema, dirty, mountVersion, customEditorMount, open, clear, markDirty, discard, save }
})
