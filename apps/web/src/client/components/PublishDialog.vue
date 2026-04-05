<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import { api } from '../api/client.js'

const props = defineProps<{ visible: boolean; itemType: string; itemName: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const targets = ref<string[]>([])
const selectedTargets = ref<string[]>([])
const publishing = ref(false)
const results = ref<Array<{ target: string; success: boolean; error?: string; copiedFiles: number }> | null>(null)

onMounted(async () => {
  try {
    targets.value = await api.getTargets()
  } catch {
    targets.value = []
  }
})

async function handlePublish() {
  if (selectedTargets.value.length === 0) return
  publishing.value = true
  results.value = null
  try {
    const item = `${props.itemType}/${props.itemName}`
    const response = await api.publish([item], selectedTargets.value)
    results.value = response.results
  } catch (err) {
    results.value = [{ target: '(all)', success: false, error: (err as Error).message, copiedFiles: 0 }]
  } finally {
    publishing.value = false
  }
}
</script>

<template>
  <Dialog :visible="props.visible" @update:visible="emit('close')" modal header="Publish" :style="{ width: '28rem' }">
    <div class="publish-content">
      <p class="publish-item">
        <i :class="itemType === 'pages' ? 'pi pi-file' : 'pi pi-share-alt'" />
        {{ itemName }}
      </p>

      <div v-if="targets.length === 0" class="publish-empty">
        No targets configured in site.yaml
      </div>

      <div v-else-if="!results" class="publish-targets">
        <p class="publish-label">Select targets:</p>
        <div v-for="target in targets" :key="target" class="publish-target">
          <Checkbox v-model="selectedTargets" :inputId="target" :value="target" />
          <label :for="target">{{ target }}</label>
        </div>
      </div>

      <div v-else class="publish-results">
        <div v-for="result in results" :key="result.target" class="publish-result"
          :class="{ success: result.success, error: !result.success }">
          <i :class="result.success ? 'pi pi-check-circle' : 'pi pi-exclamation-circle'" />
          <span class="result-target">{{ result.target }}</span>
          <span v-if="result.success" class="result-detail">{{ result.copiedFiles }} files</span>
          <span v-else class="result-detail">{{ result.error }}</span>
        </div>
      </div>
    </div>

    <template #footer>
      <Button v-if="results" label="Done" @click="emit('close')" />
      <template v-else>
        <Button label="Cancel" severity="secondary" text @click="emit('close')" />
        <Button label="Publish" icon="pi pi-cloud-upload" :loading="publishing"
          :disabled="selectedTargets.length === 0" @click="handlePublish" />
      </template>
    </template>
  </Dialog>
</template>

<style scoped>
.publish-content { display: flex; flex-direction: column; gap: 1rem; }
.publish-item { display: flex; align-items: center; gap: 0.5rem; font-weight: 600; font-size: 1rem; }
.publish-empty { color: #888; font-size: 0.875rem; }
.publish-label { font-size: 0.75rem; text-transform: uppercase; color: #888; letter-spacing: 0.03em; }
.publish-targets { display: flex; flex-direction: column; gap: 0.5rem; }
.publish-target { display: flex; align-items: center; gap: 0.5rem; }
.publish-target label { cursor: pointer; }
.publish-results { display: flex; flex-direction: column; gap: 0.5rem; }
.publish-result { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; border-radius: 6px; }
.publish-result.success { background: #052e16; color: #4ade80; }
.publish-result.error { background: #450a0a; color: #f87171; }
.result-target { font-weight: 600; }
.result-detail { margin-left: auto; font-size: 0.875rem; opacity: 0.8; }
</style>
