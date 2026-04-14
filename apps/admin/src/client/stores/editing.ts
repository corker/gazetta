function deepClone<T>(obj: T): T { return JSON.parse(JSON.stringify(obj)) }

import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'
import { useToastStore } from './toast.js'
import { usePreviewStore } from './preview.js'
import { useSelectionStore } from './selection.js'
import { usePublishStatusStore } from './publishStatus.js'
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

  /** Build a save function that updates a component's content within the page/fragment JSON */
  function buildSaveFn(namePath: string): (content: Record<string, unknown>) => Promise<void> {
    return async (newContent: Record<string, unknown>) => {
      const sel = useSelectionStore()
      const detail = sel.detail
      if (!detail || !sel.selection) return

      // Deep clone the components array and update the target component's content
      const updatedComponents = deepClone(detail.components ?? [])
      const parts = namePath.split('/')
      let components = updatedComponents as Array<string | { name: string; template: string; content?: Record<string, unknown>; components?: unknown[] }>

      for (let i = 0; i < parts.length; i++) {
        const idx = components.findIndex(c => typeof c === 'object' && c.name === parts[i])
        if (idx === -1) return
        const comp = components[idx] as { name: string; template: string; content?: Record<string, unknown>; components?: unknown[] }
        if (i === parts.length - 1) {
          comp.content = newContent
        } else {
          components = (comp.components ?? []) as typeof components
        }
      }

      if (sel.selection.type === 'page') {
        await api.updatePage(sel.selection.name, { components: updatedComponents })
      } else {
        await api.updateFragment(sel.selection.name, { components: updatedComponents })
      }
    }
  }

  /** Find an inline component by name path (e.g., "hero", "features/fast") in the selection detail */
  function findComponentByNamePath(namePath: string): { template: string; content: Record<string, unknown> } | null {
    const sel = useSelectionStore()
    const detail = sel.detail
    if (!detail?.components) return null

    const parts = namePath.split('/')
    let components = detail.components as Array<string | { name: string; template: string; content?: Record<string, unknown>; components?: unknown[] }>

    for (let i = 0; i < parts.length; i++) {
      const comp = components.find(c => typeof c === 'object' && c.name === parts[i])
      if (!comp || typeof comp === 'string') return null
      if (i === parts.length - 1) return { template: comp.template, content: (comp.content as Record<string, unknown>) ?? {} }
      components = (comp.components ?? []) as typeof components
    }
    return null
  }

  async function openComponent(namePath: string, templateName: string) {
    clearRetry()
    stashCurrent()
    const stashed = pendingEdits.get(namePath)
    if (stashed) {
      pendingEdits.delete(namePath)
      await open(stashed.target, stashed.editedContent)
      return
    }
    try {
      const comp = findComponentByNamePath(namePath)
      if (!comp) throw new Error(`Component "${namePath}" not found in page manifest`)
      const { schema, hasEditor, editorUrl, fieldsBaseUrl } = await fetchSchema(templateName)
      await open({ template: templateName, path: namePath, content: comp.content, schema, hasEditor, editorUrl, fieldsBaseUrl, save: buildSaveFn(namePath) })
    } catch (err) {
      target.value = null
      loadError.value = `Failed to load "${templateName}": ${(err as Error).message}`
      retryTimer = setInterval(() => openComponent(namePath, templateName), 3000)
    }
  }

  async function openPageRoot() {
    clearRetry()
    stashCurrent()
    const sel = useSelectionStore()
    const d = sel.detail
    const selection = sel.selection
    if (!d || !selection) return
    const rootPath = '_root'
    const stashed = pendingEdits.get(rootPath)
    if (stashed) {
      pendingEdits.delete(rootPath)
      await open(stashed.target, stashed.editedContent)
      return
    }
    try {
      const pageContent = (d.content as Record<string, unknown>) ?? {}
      const { schema, hasEditor, editorUrl, fieldsBaseUrl } = await fetchSchema(d.template)
      const saveFn = selection.type === 'page'
        ? (c: Record<string, unknown>) => api.updatePage(selection.name, { content: c }).then(() => {})
        : (c: Record<string, unknown>) => api.updateFragment(selection.name, { content: c }).then(() => {})
      await open({ template: d.template, path: rootPath, content: pageContent, schema, hasEditor, editorUrl, fieldsBaseUrl, save: saveFn })
    } catch (err) {
      target.value = null
      loadError.value = `Failed to load "${d.template}": ${(err as Error).message}`
      retryTimer = setInterval(() => openPageRoot(), 3000)
    }
  }

  async function openFragment(fragName: string) {
    clearRetry()
    stashCurrent()
    const stashKey = `@${fragName}`
    const stashed = pendingEdits.get(stashKey)
    if (stashed) {
      pendingEdits.delete(stashKey)
      await open(stashed.target, stashed.editedContent)
      return
    }
    try {
      const frag = await api.getFragment(fragName)
      const fragContent = (frag.content as Record<string, unknown>) ?? {}
      const { schema, hasEditor, editorUrl, fieldsBaseUrl } = await fetchSchema(frag.template)
      await open({ template: frag.template, path: stashKey, content: fragContent, schema, hasEditor, editorUrl, fieldsBaseUrl, save: (c) => api.updateFragment(fragName, { content: c }).then(() => {}) })
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
      for (const entry of pendingEdits.values()) {
        await entry.target.save(entry.editedContent)
      }
      pendingEdits.clear()
      usePreviewStore().invalidate()
      // Re-check publish state — saving may have flipped this page from
      // unchanged to dirty (or vice-versa if content matches the target).
      usePublishStatusStore().refresh()
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
