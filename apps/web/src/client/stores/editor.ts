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

  const previewRoute = computed(() => {
    if (selectionType.value === 'page' && pageDetail.value) return pageDetail.value.route
    return null
  })

  async function selectPage(name: string) {
    selectionType.value = 'page'
    selectionName.value = name
    fragmentDetail.value = null
    selectedComponentPath.value = null
    componentContent.value = null
    templateSchema.value = null
    pageDetail.value = await api.getPage(name)
  }

  async function selectFragment(name: string) {
    selectionType.value = 'fragment'
    selectionName.value = name
    pageDetail.value = null
    selectedComponentPath.value = null
    componentContent.value = null
    templateSchema.value = null
    fragmentDetail.value = await api.getFragment(name)
  }

  async function selectComponent(path: string, template: string) {
    selectedComponentPath.value = path
    componentTemplate.value = template
    const comp = await api.getComponent(path)
    componentContent.value = (comp.content as Record<string, unknown>) ?? {}
    templateSchema.value = await api.getTemplateSchema(template)
  }

  async function saveComponent(content: Record<string, unknown>) {
    if (!selectedComponentPath.value) return
    saving.value = true
    try {
      await api.updateComponent(selectedComponentPath.value, { content })
      componentContent.value = content
    } finally {
      saving.value = false
    }
  }

  return {
    selectionType, selectionName, pageDetail, fragmentDetail,
    selectedComponentPath, componentContent, componentTemplate, templateSchema,
    previewRoute, saving,
    selectPage, selectFragment, selectComponent, saveComponent,
  }
})
