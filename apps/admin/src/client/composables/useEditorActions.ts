function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

import { computed } from 'vue'
import { useToastStore } from '../stores/toast.js'
import { usePreviewStore } from '../stores/preview.js'
import { useSelectionStore } from '../stores/selection.js'
import { usePublishStatusStore } from '../stores/publishStatus.js'
import { useActiveTargetStore } from '../stores/activeTarget.js'
import { useSiteStore } from '../stores/site.js'
import { useEditorStashStore } from '../stores/editorStash.js'
import { useEditorPersistenceStore } from '../stores/editorPersistence.js'
import { useEditorContentStore, type EditingTarget } from '../stores/editorContent.js'
import { api } from '../api/client.js'

const MAX_RETRY_ATTEMPTS = 3
const BASE_RETRY_DELAY = 3000

/**
 * Editor action mediator — wires editorContent, editorStash, and
 * editorPersistence together. Owns all orchestration: stash-before-open,
 * retry with bounded backoff, save + side effects, undo, and
 * beforeunload guard.
 *
 * Components call these actions. State is read from the individual stores.
 */
export function useEditorActions() {
  const toast = useToastStore()
  const stash = useEditorStashStore()
  const persistence = useEditorPersistenceStore()
  const ec = useEditorContentStore()

  // --- Retry state ---

  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let retryGeneration = 0

  function clearRetry() {
    retryGeneration++
    if (retryTimer !== null) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
  }

  function scheduleRetry(fn: () => void, attempt: number) {
    const delay = BASE_RETRY_DELAY * 2 ** attempt
    const gen = retryGeneration
    retryTimer = setTimeout(() => {
      if (gen !== retryGeneration) return
      retryTimer = null
      fn()
    }, delay)
  }

  // --- Stash helpers ---

  function stashCurrent() {
    if (ec.dirty && ec.target && ec.content) {
      stash.stash(ec.target.path, ec.target, deepClone(ec.content))
    }
  }

  // --- Schema + component lookup ---

  async function fetchSchema(templateName: string) {
    const response = await api.getTemplateSchema(templateName)
    const { hasEditor, editorUrl, fieldsBaseUrl, ...schema } = response as Record<string, unknown> & {
      hasEditor?: boolean
      editorUrl?: string
      fieldsBaseUrl?: string
    }
    return { schema, hasEditor: !!hasEditor, editorUrl, fieldsBaseUrl }
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

  // --- Open (with side effects) ---

  async function open(t: EditingTarget, editedContent?: Record<string, unknown>) {
    clearRetry()
    persistence.saving = false
    persistence.lastSaveError = null
    await ec.open(t, editedContent)
    usePreviewStore().invalidateDraft()
  }

  // --- Stash + retry wrapper ---

  async function withStashAndRetry(
    stashKey: string,
    errorLabel: string,
    runOpen: () => Promise<void>,
    retryFn: () => void,
  ) {
    clearRetry()
    stashCurrent()
    const stashed = stash.restore(stashKey)
    if (stashed) {
      await open(stashed.target, stashed.editedContent)
      return
    }
    let attempt = 0
    const tryOnce = async () => {
      try {
        await runOpen()
      } catch (err) {
        ec.setLoadError(`Failed to load "${errorLabel}": ${(err as Error).message}`)
        attempt++
        if (attempt < MAX_RETRY_ATTEMPTS) {
          scheduleRetry(retryFn, attempt - 1)
        }
      }
    }
    await tryOnce()
  }

  // --- Public open methods ---

  async function openComponent(namePath: string, templateName: string) {
    await withStashAndRetry(
      namePath,
      templateName,
      async () => {
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
      },
      () => openComponent(namePath, templateName),
    )
  }

  async function openPageRoot() {
    const sel = useSelectionStore()
    const d = sel.detail
    const selection = sel.selection
    if (!d || !selection) return
    await withStashAndRetry(
      '_root',
      d.template,
      async () => {
        const pageContent = (d.content as Record<string, unknown>) ?? {}
        const { schema, hasEditor, editorUrl, fieldsBaseUrl } = await fetchSchema(d.template)
        const saveFn =
          selection.type === 'page'
            ? (c: Record<string, unknown>) => api.updatePage(selection.name, { content: c }).then(() => {})
            : (c: Record<string, unknown>) => api.updateFragment(selection.name, { content: c }).then(() => {})
        await open({
          template: d.template,
          path: '_root',
          content: pageContent,
          schema,
          hasEditor,
          editorUrl,
          fieldsBaseUrl,
          save: saveFn,
        })
      },
      () => openPageRoot(),
    )
  }

  async function openFragment(fragName: string) {
    await withStashAndRetry(
      `@${fragName}`,
      `fragment "${fragName}"`,
      async () => {
        const frag = await api.getFragment(fragName)
        const fragContent = (frag.content as Record<string, unknown>) ?? {}
        const { schema, hasEditor, editorUrl, fieldsBaseUrl } = await fetchSchema(frag.template)
        await open({
          template: frag.template,
          path: `@${fragName}`,
          content: fragContent,
          schema,
          hasEditor,
          editorUrl,
          fieldsBaseUrl,
          save: c => api.updateFragment(fragName, { content: c }).then(() => {}),
        })
      },
      () => openFragment(fragName),
    )
  }

  // --- Fragment link ---

  function showFragmentLink(nameOrPath: string) {
    stashCurrent()
    clearRetry()
    ec.showFragmentLink(nameOrPath)
  }

  // --- Content operations (with preview side effects) ---

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

  // --- Clear ---

  function clear() {
    clearRetry()
    ec.clear()
    persistence.saving = false
    persistence.lastSaveError = null
    stash.clearAll()
  }

  // --- Save ---

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

  // --- Post-restore refresh ---

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

  // --- Derived state ---

  const pendingCount = computed(() => stash.size + (ec.dirty ? 1 : 0))
  const hasPendingEdits = computed(() => pendingCount.value > 0)
  const allOverrides = computed(() => {
    const result: Record<string, Record<string, unknown>> = {}
    for (const entry of stash.entries) result[entry[0]] = entry[1].editedContent
    if (ec.path && ec.content && ec.dirty) result[ec.path] = ec.content
    return result
  })

  // --- Beforeunload guard ---

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', (e: BeforeUnloadEvent) => {
      if (hasPendingEdits.value) {
        e.preventDefault()
        e.returnValue = ''
      }
    })
  }

  return {
    // Actions
    openComponent,
    openPageRoot,
    openFragment,
    showFragmentLink,
    open,
    markDirty,
    revertStashed,
    discard,
    clear,
    save,
    refreshAfterRestore,
    // Derived state
    pendingCount,
    hasPendingEdits,
    hasPendingEdit: (path: string) => stash.has(path),
    allOverrides,
  }
}
