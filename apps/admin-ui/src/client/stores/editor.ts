function deepClone<T>(obj: T): T { return JSON.parse(JSON.stringify(obj)) }

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, type PageDetail, type FragmentDetail } from '../api/client.js'

export type SelectionType = 'page' | 'fragment'

export const useEditorStore = defineStore('editor', () => {
  const selectionType = ref<SelectionType | null>(null)
  const selectionName = ref<string | null>(null)
  const pageDetail = ref<PageDetail | null>(null)
  const fragmentDetail = ref<FragmentDetail | null>(null)
  const selectedComponentPath = ref<string | null>(null)
  const componentContent = ref<Record<string, unknown> | null>(null)
  const componentTemplate = ref<string | null>(null)
  const templateSchema = ref<Record<string, unknown> | null>(null)
  const saving = ref(false)
  const dirty = ref(false)
  const lastSaveError = ref<string | null>(null)
  const lastSaveSuccess = ref(false)
  const savedContent = ref<Record<string, unknown> | null>(null)
  const previewVersion = ref(0)
  const draftVersion = ref(0)

  // Toast notification system
  const toast = ref<{ message: string; type: 'success' | 'error' } | null>(null)

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    toast.value = { message, type }
    setTimeout(() => { toast.value = null }, 3000)
  }

  function showError(err: unknown, fallback: string) {
    const message = err instanceof Error ? err.message : fallback
    // Make API errors more readable
    const friendly = message
      .replace(/^Request failed: (\d+)$/, 'Server error ($1)')
      .replace(/^Failed to fetch$/, 'Cannot connect to server')
    showToast(friendly, 'error')
  }

  const previewRoute = computed(() => {
    if (selectionType.value === 'page' && pageDetail.value) return pageDetail.value.route
    return null
  })

  function markDirty(content: Record<string, unknown>) {
    componentContent.value = content
    dirty.value = true
    lastSaveError.value = null
    lastSaveSuccess.value = false
    draftVersion.value++
  }

  async function selectPage(name: string) {
    try {
      selectionType.value = 'page'
      selectionName.value = name
      fragmentDetail.value = null
      clearComponentSelection()
      pageDetail.value = await api.getPage(name)
      previewVersion.value++
    } catch (err) {
      showError(err, `Failed to load page "${name}"`)
    }
  }

  async function selectFragment(name: string) {
    try {
      selectionType.value = 'fragment'
      selectionName.value = name
      pageDetail.value = null
      clearComponentSelection()
      fragmentDetail.value = await api.getFragment(name)
    } catch (err) {
      showError(err, `Failed to load fragment "${name}"`)
    }
  }

  function clearComponentSelection() {
    editingPageContent.value = false
    selectedComponentPath.value = null
    componentContent.value = null
    componentTemplate.value = null
    templateSchema.value = null
    savedContent.value = null
    dirty.value = false
    lastSaveError.value = null
    lastSaveSuccess.value = false
  }

  async function selectComponent(path: string, template: string) {
    try {
      editingPageContent.value = false
      selectedComponentPath.value = path
      componentTemplate.value = template
      dirty.value = false
      lastSaveError.value = null
      lastSaveSuccess.value = false
      const comp = await api.getComponent(path)
      const content = (comp.content as Record<string, unknown>) ?? {}
      componentContent.value = content
      savedContent.value = deepClone(content)
      templateSchema.value = await api.getTemplateSchema(template)
    } catch (err) {
      showError(err, `Failed to load component`)
    }
  }

  // Track whether we're editing a page or a component (different save endpoints)
  const editingPageContent = ref(false)

  async function selectPageContent() {
    const detail = pageDetail.value ?? fragmentDetail.value
    if (!detail) return
    try {
      editingPageContent.value = true
      selectedComponentPath.value = detail.dir
      componentTemplate.value = detail.template
      dirty.value = false
      lastSaveError.value = null
      lastSaveSuccess.value = false
      const content = (detail.content as Record<string, unknown>) ?? {}
      componentContent.value = content
      savedContent.value = deepClone(content)
      templateSchema.value = await api.getTemplateSchema(detail.template)
    } catch (err) {
      showError(err, 'Failed to load page content')
    }
  }

  async function saveComponent() {
    if (!selectedComponentPath.value || !componentContent.value) return
    saving.value = true
    lastSaveError.value = null
    lastSaveSuccess.value = false
    try {
      if (editingPageContent.value && selectionName.value) {
        await api.updatePage(selectionName.value, { content: componentContent.value })
      } else {
        await api.updateComponent(selectedComponentPath.value, { content: componentContent.value })
      }
      savedContent.value = deepClone(componentContent.value)
      dirty.value = false
      lastSaveSuccess.value = true
      previewVersion.value++
      showToast('Saved')
      setTimeout(() => { lastSaveSuccess.value = false }, 3000)
    } catch (err) {
      lastSaveError.value = (err as Error).message
      showError(err, 'Failed to save')
    } finally {
      saving.value = false
    }
  }

  function discardChanges() {
    if (savedContent.value) {
      componentContent.value = deepClone(savedContent.value)
      dirty.value = false
      draftVersion.value++
    }
  }

  async function moveComponent(index: number, direction: -1 | 1) {
    const detail = pageDetail.value ?? fragmentDetail.value
    if (!detail?.components) return
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= detail.components.length) return

    const components = [...detail.components]
    const [moved] = components.splice(index, 1)
    components.splice(newIndex, 0, moved)

    try {
      if (selectionType.value === 'page' && selectionName.value) {
        await api.updatePage(selectionName.value, { components })
        pageDetail.value = await api.getPage(selectionName.value)
      } else if (selectionType.value === 'fragment' && selectionName.value) {
        await api.updateFragment(selectionName.value, { components })
        fragmentDetail.value = await api.getFragment(selectionName.value)
      }
      previewVersion.value++
    } catch (err) {
      showError(err, 'Failed to move component')
    }
  }

  async function removeComponent(index: number) {
    const detail = pageDetail.value ?? fragmentDetail.value
    if (!detail?.components) return

    const components = [...detail.components]
    const removed = components.splice(index, 1)[0]

    try {
      if (selectionType.value === 'page' && selectionName.value) {
        await api.updatePage(selectionName.value, { components })
        pageDetail.value = await api.getPage(selectionName.value)
      } else if (selectionType.value === 'fragment' && selectionName.value) {
        await api.updateFragment(selectionName.value, { components })
        fragmentDetail.value = await api.getFragment(selectionName.value)
      }
      clearComponentSelection()
      previewVersion.value++
      showToast(`Removed "${removed}"`)
    } catch (err) {
      showError(err, 'Failed to remove component')
    }
  }

  async function addComponent(name: string, template: string) {
    const detail = pageDetail.value ?? fragmentDetail.value
    if (!detail) return

    try {
      await api.createComponent(detail.dir, name, template)

      const components = [...(detail.components ?? []), name]

      if (selectionType.value === 'page' && selectionName.value) {
        await api.updatePage(selectionName.value, { components })
        pageDetail.value = await api.getPage(selectionName.value)
      } else if (selectionType.value === 'fragment' && selectionName.value) {
        await api.updateFragment(selectionName.value, { components })
        fragmentDetail.value = await api.getFragment(selectionName.value)
      }
      previewVersion.value++
      showToast(`Added "${name}"`)
    } catch (err) {
      showError(err, `Failed to add component "${name}"`)
    }
  }

  return {
    selectionType, selectionName, pageDetail, fragmentDetail,
    selectedComponentPath, componentContent, componentTemplate, templateSchema,
    previewRoute, previewVersion, draftVersion, saving, dirty, lastSaveError, lastSaveSuccess,
    toast,
    selectPage, selectFragment, selectComponent, selectPageContent, saveComponent,
    markDirty, discardChanges, clearComponentSelection,
    moveComponent, removeComponent, addComponent,
  }
})
