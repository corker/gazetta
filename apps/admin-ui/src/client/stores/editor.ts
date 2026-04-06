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
    selectionType.value = 'page'
    selectionName.value = name
    fragmentDetail.value = null
    clearComponentSelection()
    pageDetail.value = await api.getPage(name)
    previewVersion.value++
  }

  async function selectFragment(name: string) {
    selectionType.value = 'fragment'
    selectionName.value = name
    pageDetail.value = null
    clearComponentSelection()
    fragmentDetail.value = await api.getFragment(name)
  }

  function clearComponentSelection() {
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
  }

  async function saveComponent() {
    if (!selectedComponentPath.value || !componentContent.value) return
    saving.value = true
    lastSaveError.value = null
    lastSaveSuccess.value = false
    try {
      await api.updateComponent(selectedComponentPath.value, { content: componentContent.value })
      savedContent.value = deepClone(componentContent.value)
      dirty.value = false
      lastSaveSuccess.value = true
      previewVersion.value++
      setTimeout(() => { lastSaveSuccess.value = false }, 3000)
    } catch (err) {
      lastSaveError.value = (err as Error).message
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

    if (selectionType.value === 'page' && selectionName.value) {
      await api.updatePage(selectionName.value, { components })
      pageDetail.value = await api.getPage(selectionName.value)
    } else if (selectionType.value === 'fragment' && selectionName.value) {
      await api.updateFragment(selectionName.value, { components })
      fragmentDetail.value = await api.getFragment(selectionName.value)
    }
    previewVersion.value++
  }

  async function removeComponent(index: number) {
    const detail = pageDetail.value ?? fragmentDetail.value
    if (!detail?.components) return

    const components = [...detail.components]
    components.splice(index, 1)

    if (selectionType.value === 'page' && selectionName.value) {
      await api.updatePage(selectionName.value, { components })
      pageDetail.value = await api.getPage(selectionName.value)
    } else if (selectionType.value === 'fragment' && selectionName.value) {
      await api.updateFragment(selectionName.value, { components })
      fragmentDetail.value = await api.getFragment(selectionName.value)
    }
    clearComponentSelection()
    previewVersion.value++
  }

  async function addComponent(name: string, template: string) {
    const detail = pageDetail.value ?? fragmentDetail.value
    if (!detail) return

    // Create the component on disk
    await api.createComponent(detail.dir, name, template)

    // Add to manifest
    const components = [...(detail.components ?? []), name]

    if (selectionType.value === 'page' && selectionName.value) {
      await api.updatePage(selectionName.value, { components })
      pageDetail.value = await api.getPage(selectionName.value)
    } else if (selectionType.value === 'fragment' && selectionName.value) {
      await api.updateFragment(selectionName.value, { components })
      fragmentDetail.value = await api.getFragment(selectionName.value)
    }
    previewVersion.value++
  }

  return {
    selectionType, selectionName, pageDetail, fragmentDetail,
    selectedComponentPath, componentContent, componentTemplate, templateSchema,
    previewRoute, previewVersion, draftVersion, saving, dirty, lastSaveError, lastSaveSuccess,
    selectPage, selectFragment, selectComponent, saveComponent,
    markDirty, discardChanges, clearComponentSelection,
    moveComponent, removeComponent, addComponent,
  }
})
