<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Listbox from 'primevue/listbox'
import { api } from '../api/client.js'
import { useSiteStore } from '../stores/site.js'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const site = useSiteStore()
const targets = ref<string[]>([])
const selectedTarget = ref<string | null>(null)
const fetching = ref(false)
const result = ref<{ success: boolean; copiedFiles: number; items: string[] } | null>(null)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    targets.value = await api.getTargets()
  } catch {
    targets.value = []
  }
})

async function handleFetch() {
  if (!selectedTarget.value) return
  fetching.value = true
  result.value = null
  error.value = null
  try {
    result.value = await api.fetchFromTarget(selectedTarget.value)
    await site.load()
  } catch (err) {
    error.value = (err as Error).message
  } finally {
    fetching.value = false
  }
}
</script>

<template>
  <Dialog :visible="props.visible" @update:visible="emit('close')" modal header="Fetch from Target" :style="{ width: '28rem' }">
    <div class="fetch-content">
      <div v-if="targets.length === 0" class="fetch-empty">
        No targets configured in site.yaml
      </div>

      <div v-else-if="!result && !error" class="fetch-select">
        <p class="fetch-label">Pull content from a target into the working copy:</p>
        <Listbox v-model="selectedTarget" :options="targets.map(t => ({ name: t }))" optionLabel="name" optionValue="name"
          class="fetch-list" />
      </div>

      <div v-else-if="result" class="fetch-result success">
        <i class="pi pi-check-circle" />
        <div>
          <p><strong>{{ result.copiedFiles }}</strong> files fetched from <strong>{{ selectedTarget }}</strong></p>
          <p class="fetch-items">{{ result.items.join(', ') }}</p>
        </div>
      </div>

      <div v-else-if="error" class="fetch-result error">
        <i class="pi pi-exclamation-circle" />
        <p>{{ error }}</p>
      </div>
    </div>

    <template #footer>
      <Button v-if="result || error" label="Done" @click="emit('close')" />
      <template v-else>
        <Button label="Cancel" severity="secondary" text @click="emit('close')" />
        <Button label="Fetch" icon="pi pi-cloud-download" :loading="fetching"
          :disabled="!selectedTarget" @click="handleFetch" />
      </template>
    </template>
  </Dialog>
</template>

<style scoped>
.fetch-content { display: flex; flex-direction: column; gap: 1rem; }
.fetch-empty { color: #888; font-size: 0.875rem; }
.fetch-label { font-size: 0.875rem; color: #aaa; margin-bottom: 0.5rem; }
.fetch-list { width: 100%; }
.fetch-result { display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.75rem; border-radius: 6px; }
.fetch-result.success { background: #052e16; color: #4ade80; }
.fetch-result.error { background: #450a0a; color: #f87171; }
.fetch-items { font-size: 0.75rem; opacity: 0.7; margin-top: 0.25rem; }
</style>
