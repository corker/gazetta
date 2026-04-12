function deepClone<T>(obj: T): T { return JSON.parse(JSON.stringify(obj)) }

import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'
import { useToastStore } from './toast.js'
import { usePreviewStore } from './preview.js'
import { useSelectionStore } from './selection.js'
import { api } from '../api/client.js'
import type { EditorMount } from 'gazetta/types'

export interface EditingTarget {
  template: string
  path: string
  content: Record<string, unknown>
  schema: Record<string, unknown>
  hasEditor?: boolean
  editorUrl?: string
  fieldsBaseUrl?: string
  save: (content: Record<string, unknown>) => Promise<void>
}

interface StashedEdit {
  target: EditingTarget
  editedContent: Record<string, unknown>
}

export const useEditingStore = defineStore('editing', () => {
  const toast = useToastStore()

  const target = ref<EditingTarget | null>(null)
  const content = ref<Record<string, unknown> | null>(null)
  const saved = ref<Record<string, unknown> | null>(null)
  const saving = ref(false)
  const lastSaveError = ref<string | null>(null)
  const loadError = ref<string | null>(null)
  const mountVersion = ref(0)
  const customEditorMount = ref<EditorMount | null>(null)
  let retryTimer: ReturnType<typeof setInterval> | null = null
  const pendingEdits = reactive<Map<string, StashedEdit>>(new Map())

  const template = computed(() => target.value?.template ?? null)
  const path = computed(() => target.value?.path ?? null)
  const schema = computed(() => target.value?.schema ?? null)
  const dirty = computed(() => {
    if (!content.value || !saved.value) return false
    return JSON.stringify(content.value) !== JSON.stringify(saved.value)
  })
  const pendingCount = computed(() => pendingEdits.size + (dirty.value ? 1 : 0))
  const hasPendingEdits = computed(() => pendingCount.value > 0)
  const allOverrides = computed(() => {
    const result: Record<string, Record<string, unknown>> = {}
    for (const [p, entry] of pendingEdits) result[p] = entry.editedContent
    if (path.value && content.value && dirty.value) result[path.value] = content.value
    return result
  })

  function hasPendingEdit(componentPath: string): boolean {
    return pendingEdits.has(componentPath)
  }

  function clearRetry() {
    if (retryTimer) { clearInterval(retryTimer); retryTimer = null }
  }

  function stashCurrent() {
    if (dirty.value && target.value && content.value) {
      pendingEdits.set(target.value.path, { target: target.value, editedContent: deepClone(content.value) })
    }
  }

  async function fetchSchema(templateName: string) {
    const response = await api.getTemplateSchema(templateName)
    const { hasEditor, editorUrl, fieldsBaseUrl, ...schema } = response as Record<string, unknown> & { hasEditor?: boolean; editorUrl?: string; fieldsBaseUrl?: string }
    return { schema, hasEditor: !!hasEditor, editorUrl, fieldsBaseUrl }
  }

  async function open(t: EditingTarget, editedContent?: Record<string, unknown>) {
    clearRetry()
    loadError.value = null
    target.value = t
    content.value = editedContent ? deepClone(editedContent) : deepClone(t.content)
    saved.value = deepClone(t.content)
    saving.value = false
    lastSaveError.value = null
    customEditorMount.value = null

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

  async function openComponent(componentPath: string, templateName: string) {
    clearRetry()
    stashCurrent()
    const stashed = pendingEdits.get(componentPath)
    if (stashed) {
      pendingEdits.delete(componentPath)
      await open(stashed.target, stashed.editedContent)
      return
    }
    try {
      const comp = await api.getComponent(componentPath)
      const componentContent = (comp.content as Record<string, unknown>) ?? {}
      const { schema, hasEditor, editorUrl, fieldsBaseUrl } = await fetchSchema(templateName)
      await open({ template: templateName, path: componentPath, content: componentContent, schema, hasEditor, editorUrl, fieldsBaseUrl, save: (c) => api.updateComponent(componentPath, { content: c }).then(() => {}) })
    } catch (err) {
      target.value = null
      loadError.value = `Failed to load "${templateName}": ${(err as Error).message}`
      retryTimer = setInterval(() => openComponent(componentPath, templateName), 3000)
    }
  }

  async function openPageRoot() {
    clearRetry()
    stashCurrent()
    const sel = useSelectionStore()
    const d = sel.detail
    const selection = sel.selection
    if (!d || !selection) return
    const pagePath = d.dir
    const stashed = pendingEdits.get(pagePath)
    if (stashed) {
      pendingEdits.delete(pagePath)
      await open(stashed.target, stashed.editedContent)
      return
    }
    try {
      const pageContent = (d.content as Record<string, unknown>) ?? {}
      const { schema, hasEditor, editorUrl, fieldsBaseUrl } = await fetchSchema(d.template)
      const saveFn = selection.type === 'page'
        ? (c: Record<string, unknown>) => api.updatePage(selection.name, { content: c }).then(() => {})
        : (c: Record<string, unknown>) => api.updateFragment(selection.name, { content: c }).then(() => {})
      await open({ template: d.template, path: pagePath, content: pageContent, schema, hasEditor, editorUrl, fieldsBaseUrl, save: saveFn })
    } catch (err) {
      target.value = null
      loadError.value = `Failed to load "${d.template}": ${(err as Error).message}`
      retryTimer = setInterval(() => openPageRoot(), 3000)
    }
  }

  async function openFragment(fragName: string) {
    clearRetry()
    stashCurrent()
    const stashed = pendingEdits.get(fragName)
    try {
      const frag = await api.getFragment(fragName)
      const fragPath = frag.dir
      const existingStash = stashed ?? pendingEdits.get(fragPath)
      if (existingStash) {
        pendingEdits.delete(existingStash === stashed ? fragName : fragPath)
        await open(existingStash.target, existingStash.editedContent)
        return
      }
      const fragContent = (frag.content as Record<string, unknown>) ?? {}
      const { schema, hasEditor, editorUrl, fieldsBaseUrl } = await fetchSchema(frag.template)
      await open({ template: frag.template, path: fragPath, content: fragContent, schema, hasEditor, editorUrl, fieldsBaseUrl, save: (c) => api.updateFragment(fragName, { content: c }).then(() => {}) })
    } catch (err) {
      target.value = null
      loadError.value = `Failed to load fragment "${fragName}": ${(err as Error).message}`
      retryTimer = setInterval(() => openFragment(fragName), 3000)
    }
  }

  function clear() {
    clearRetry()
    loadError.value = null
    target.value = null
    content.value = null
    saved.value = null
    saving.value = false
    lastSaveError.value = null
    pendingEdits.clear()
  }

  const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
    if (hasPendingEdits.value) { e.preventDefault(); e.returnValue = '' }
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', beforeUnloadHandler)
  }

  function markDirty(newContent: Record<string, unknown>) {
    content.value = newContent
    usePreviewStore().invalidateDraft()
  }

  function revertStashed(componentPath: string) {
    pendingEdits.delete(componentPath)
    usePreviewStore().invalidateDraft()
  }

  function discard() {
    if (!target.value || !saved.value) return
    content.value = deepClone(saved.value)
    mountVersion.value++
    usePreviewStore().invalidateDraft()
  }

  async function save() {
    if (!target.value && pendingEdits.size === 0) return
    saving.value = true
    lastSaveError.value = null
    try {
      if (target.value && content.value) {
        await target.value.save(content.value)
        saved.value = deepClone(content.value)
      }
      for (const [p, entry] of pendingEdits) {
        await entry.target.save(entry.editedContent)
      }
      pendingEdits.clear()
      usePreviewStore().invalidate()
      toast.show('Saved')
    } catch (err) {
      lastSaveError.value = (err as Error).message
      toast.showError(err, 'Failed to save')
    } finally {
      saving.value = false
    }
  }

  return {
    target, content, saved, saving, lastSaveError, template, path, schema,
    dirty, loadError, mountVersion, customEditorMount, pendingEdits, pendingCount,
    hasPendingEdits, allOverrides,
    open, openComponent, openPageRoot, openFragment,
    clear, markDirty, discard, revertStashed, save, hasPendingEdit,
  }
})
