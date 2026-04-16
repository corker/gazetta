<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Listbox from 'primevue/listbox'
import { usePagesApi, useTemplatesApi } from '../composables/api.js'
import { useSiteStore } from '../stores/site.js'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const site = useSiteStore()
const pagesApi = usePagesApi()
const templatesApi = useTemplatesApi()
const templates = ref<Array<{ name: string }>>([])
const selectedTemplate = ref<string | null>(null)
const pageName = ref('')
const creating = ref(false)
const error = ref<string | null>(null)

const derivedRoute = computed(() => {
  const name = pageName.value.trim().toLowerCase().replace(/\s+/g, '-')
  if (!name || name === 'home') return '/'
  return `/${name}`
})

onMounted(async () => {
  templates.value = await templatesApi.getTemplates()
})

async function handleCreate() {
  if (!selectedTemplate.value || !pageName.value.trim()) return
  creating.value = true
  error.value = null
  try {
    const name = pageName.value.trim().toLowerCase().replace(/\s+/g, '-').replace(/\/+/g, '/')
    await pagesApi.createPage({ name, template: selectedTemplate.value })
    await site.load()
    emit('close')
  } catch (err) {
    error.value = (err as Error).message
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <Dialog :visible="props.visible" @update:visible="emit('close')" modal header="New Page" :style="{ width: '24rem' }">
    <div class="create-content">
      <div class="create-field">
        <label>Page name</label>
        <InputText v-model="pageName" placeholder="e.g. contact or blog/my-post" class="create-input" />
        <span v-if="pageName.trim()" class="create-hint">Route: {{ derivedRoute }}</span>
      </div>

      <div class="create-field">
        <label>Page template</label>
        <Listbox v-model="selectedTemplate" :options="templates" optionLabel="name" optionValue="name"
          class="create-list" :style="{ maxHeight: '200px' }" />
      </div>

      <p v-if="error" class="create-error">{{ error }}</p>
    </div>

    <template #footer>
      <Button label="Cancel" severity="secondary" text @click="emit('close')" />
      <Button label="Create" icon="pi pi-plus" :loading="creating"
        :disabled="!selectedTemplate || !pageName.trim()" @click="handleCreate" />
    </template>
  </Dialog>
</template>

<style scoped>
.create-content { display: flex; flex-direction: column; gap: 1rem; }
.create-field { display: flex; flex-direction: column; gap: 0.375rem; }
.create-field label { font-size: 0.75rem; text-transform: uppercase; color: #888; letter-spacing: 0.03em; }
.create-input { width: 100%; }
.create-list { width: 100%; }
.create-hint { font-size: 0.75rem; color: #666; }
.create-error { color: #f87171; font-size: 0.875rem; }
</style>
