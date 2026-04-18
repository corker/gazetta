function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useToastStore } from './toast.js'
import { usePreviewStore } from './preview.js'
import { useSelectionStore } from './selection.js'
import { usePublishStatusStore } from './publishStatus.js'
import { useActiveTargetStore } from './activeTarget.js'
import { useSiteStore } from './site.js'
import { useEditorStashStore } from './editorStash.js'
import { useEditorPersistenceStore } from './editorPersistence.js'
import { useEditorContentStore } from './editorContent.js'
import { api } from '../api/client.js'

export type { EditingTarget } from './editorContent.js'

export const useEditingStore = defineStore('editing', () => {
  const toast = useToastStore()
  const stash = useEditorStashStore()
  const persistence = useEditorPersistenceStore()
  const ec = useEditorContentStore()

  let retryTimer: ReturnType<typeof setInterval> | null = null

  // Derived state that combines content + stash stores
  const pendingCount = computed(() => stash.size + (ec.dirty ? 1 : 0))
  const hasPendingEdits = computed(() => pendingCount.value > 0)
  const allOverrides = computed(() => {
    const result: Record<string, Record<string, unknown>> = {}
    for (const entry of stash.entries) result[entry[0]] = entry[1].editedContent
    if (ec.path && ec.content && ec.dirty) result[ec.path] = ec.content
    return result
  })

  function hasPendingEdit(componentPath: string): boolean {
    return stash.has(componentPath)
  }

  function clearRetry() {
    if (retryTimer) {
      clearInterval(retryTimer)
      retryTimer = null
    }
  }

  function stashCurrent() {
    if (ec.dirty && ec.target && ec.content) {
      stash.stash(ec.target.path, ec.target, deepClone(ec.content))
    }
  }

  async function fetchSchema(templateName: string) {
    const response = await api.getTemplateSchema(templateName)
    const { hasEditor, editorUrl, fieldsBaseUrl, ...schema } = response as Record<string, unknown> & {
      hasEditor?: boolean
      editorUrl?: string
      fieldsBaseUrl?: string
    }
    return { schema, hasEditor: !!hasEditor, editorUrl, fieldsBaseUrl }
  }

  function showFragmentLink(nameOrPath: string) {
    stashCurrent()
    clearRetry()
    ec.showFragmentLink(nameOrPath)
  }

  async function open(t: Parameters<typeof ec.open>[0], editedContent?: Parameters<typeof ec.open>[1]) {
    clearRetry()
    persistence.saving = false
    persistence.lastSaveError = null
    await ec.open(t, editedContent)
    usePreviewStore().invalidateDraft()
  }

  /** Build a save function that updates a component's content within the page/fragment JSON */
  function buildSaveFn(namePath: string): (content: Record<string, unknown>) => Promise<void> {
    return async (newContent: Record<string, unknown>) => {
      const sel = useSelectionStore()
      const detail = sel.detail
      if (!detail || !sel.selection) return

      const updatedComponents = deepClone(detail.components ?? [])
      const parts = resolveComponentPath(namePath).split('/')
      let components = updatedComponents as Array<
        string | { name: string; template: string; content?: Record<string, unknown>; components?: unknown[] }
      >

      for (let i = 0; i < parts.length; i++) {
        const idx = components.findIndex(c => typeof c === 'object' && c.name === parts[i])
        if (idx === -1) return
        const comp = components[idx] as {
          name: string
          template: string
          content?: Record<string, unknown>
          components?: unknown[]
        }
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

  function resolveComponentPath(namePath: string): string {
    const sel = useSelectionStore()
    if (sel.type === 'fragment' && sel.name && namePath.startsWith(`@${sel.name}/`)) {
      return namePath.slice(`@${sel.name}/`.length)
    }
    return namePath
  }

  function findComponentByNamePath(namePath: string): { template: string; content: Record<string, unknown> } | null {
    const sel = useSelectionStore()
    const detail = sel.detail
    if (!detail?.components) return null

    const parts = resolveComponentPath(namePath).split('/')
    let components = detail.components as Array<
      string | { name: string; template: string; content?: Record<string, unknown>; components?: unknown[] }
    >

    for (let i = 0; i < parts.length; i++) {
      const comp = components.find(c => typeof c === 'object' && c.name === parts[i])
      if (!comp || typeof comp === 'string') return null
      if (i === parts.length - 1)
        return { template: comp.template, content: (comp.content as Record<string, unknown>) ?? {} }
      components = (comp.components ?? []) as typeof components
    }
    return null
  }

  async function openComponent(namePath: string, templateName: string) {
    clearRetry()
    stashCurrent()
    const stashed = stash.restore(namePath)
    if (stashed) {
      await open(stashed.target, stashed.editedContent)
      return
    }
    try {
      const comp = findComponentByNamePath(namePath)
      if (!comp) throw new Error(`Component "${namePath}" not found in page manifest`)
      const { schema, hasEditor, editorUrl, fieldsBaseUrl } = await fetchSchema(templateName)
      await open({
        template: templateName,
        path: namePath,
        content: comp.content,
        schema,
        hasEditor,
        editorUrl,
        fieldsBaseUrl,
        save: buildSaveFn(namePath),
      })
    } catch (err) {
      ec.setLoadError(`Failed to load "${templateName}": ${(err as Error).message}`)
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
    const stashed = stash.restore(rootPath)
    if (stashed) {
      await open(stashed.target, stashed.editedContent)
      return
    }
    try {
      const pageContent = (d.content as Record<string, unknown>) ?? {}
      const { schema, hasEditor, editorUrl, fieldsBaseUrl } = await fetchSchema(d.template)
      const saveFn =
        selection.type === 'page'
          ? (c: Record<string, unknown>) => api.updatePage(selection.name, { content: c }).then(() => {})
          : (c: Record<string, unknown>) => api.updateFragment(selection.name, { content: c }).then(() => {})
      await open({
        template: d.template,
        path: rootPath,
        content: pageContent,
        schema,
        hasEditor,
        editorUrl,
        fieldsBaseUrl,
        save: saveFn,
      })
    } catch (err) {
      ec.setLoadError(`Failed to load "${d.template}": ${(err as Error).message}`)
      retryTimer = setInterval(() => openPageRoot(), 3000)
    }
  }

  async function openFragment(fragName: string) {
    clearRetry()
    stashCurrent()
    const stashKey = `@${fragName}`
    const stashed = stash.restore(stashKey)
    if (stashed) {
      await open(stashed.target, stashed.editedContent)
      return
    }
    try {
      const frag = await api.getFragment(fragName)
      const fragContent = (frag.content as Record<string, unknown>) ?? {}
      const { schema, hasEditor, editorUrl, fieldsBaseUrl } = await fetchSchema(frag.template)
      await open({
        template: frag.template,
        path: stashKey,
        content: fragContent,
        schema,
        hasEditor,
        editorUrl,
        fieldsBaseUrl,
        save: c => api.updateFragment(fragName, { content: c }).then(() => {}),
      })
    } catch (err) {
      ec.setLoadError(`Failed to load fragment "${fragName}": ${(err as Error).message}`)
      retryTimer = setInterval(() => openFragment(fragName), 3000)
    }
  }

  function clear() {
    clearRetry()
    ec.clear()
    persistence.saving = false
    persistence.lastSaveError = null
    stash.clearAll()
  }

  const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
    if (hasPendingEdits.value) {
      e.preventDefault()
      e.returnValue = ''
    }
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', beforeUnloadHandler)
  }

  function markDirty(newContent: Record<string, unknown>) {
    ec.markDirty(newContent)
    usePreviewStore().invalidateDraft()
  }

  function revertStashed(componentPath: string) {
    stash.revert(componentPath)
    usePreviewStore().invalidateDraft()
  }

  function discard() {
    ec.discard()
    usePreviewStore().invalidateDraft()
  }

  async function refreshAfterRestore(): Promise<void> {
    const targetSnapshot = ec.target ? { template: ec.target.template, path: ec.target.path } : null
    clear()
    await useSiteStore().reload()
    await useSelectionStore().reload()
    if (targetSnapshot) {
      if (targetSnapshot.path === '_root') {
        const sel = useSelectionStore()
        if (sel.type === 'page') await openPageRoot()
        else if (sel.type === 'fragment' && sel.name) await openFragment(sel.name)
      } else {
        await openComponent(targetSnapshot.path, targetSnapshot.template)
      }
    }
    usePreviewStore().invalidate()
    usePublishStatusStore().refresh()
  }

  function buildUndoAction(): { label: string; handler: () => Promise<void> } | undefined {
    const active = useActiveTargetStore().activeTargetName
    if (!active) return undefined
    return {
      label: 'Undo',
      handler: async () => {
        try {
          await api.undoLastWrite(active)
          await refreshAfterRestore()
          toast.show('Undone')
        } catch (err) {
          toast.showError(err, 'Undo failed')
        }
      },
    }
  }

  async function save() {
    const current = ec.target && ec.content ? { target: ec.target, content: ec.content } : null
    const result = await persistence.save(current, [...stash.values()])
    if (result.success) {
      ec.markSaved()
      stash.clearAll()
      usePreviewStore().invalidate()
      usePublishStatusStore().refresh()
      toast.show('Saved', { action: buildUndoAction() })
    } else {
      toast.showError(new Error(result.error), 'Failed to save')
    }
  }

  return {
    // Passthrough from editorContent
    target: computed(() => ec.target),
    content: computed(() => ec.content),
    saved: computed(() => ec.saved),
    template: computed(() => ec.template),
    path: computed(() => ec.path),
    schema: computed(() => ec.schema),
    dirty: computed(() => ec.dirty),
    loadError: computed(() => ec.loadError),
    mountVersion: computed(() => ec.mountVersion),
    customEditorMount: computed(() => ec.customEditorMount),
    fragmentLink: computed(() => ec.fragmentLink),
    // Passthrough from editorPersistence
    saving: computed(() => persistence.saving),
    lastSaveError: computed(() => persistence.lastSaveError),
    // Derived from stash + content
    pendingCount,
    hasPendingEdits,
    allOverrides,
    // Methods
    open,
    openComponent,
    openPageRoot,
    openFragment,
    showFragmentLink,
    clear,
    markDirty,
    discard,
    revertStashed,
    save,
    hasPendingEdit,
    refreshAfterRestore,
  }
})
