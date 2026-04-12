<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Toolbar from 'primevue/toolbar'
import Button from 'primevue/button'
import { useSiteStore } from '../stores/site.js'
import { useSelectionStore } from '../stores/selection.js'
import { useEditingStore } from '../stores/editing.js'
import { useThemeStore } from '../stores/theme.js'
import { useUiModeStore } from '../stores/uiMode.js'
import { useUnsavedGuardStore } from '../stores/unsavedGuard.js'
import PublishDialog from './PublishDialog.vue'
import FetchDialog from './FetchDialog.vue'

const route = useRoute()
const router = useRouter()
const isDevPage = computed(() => route.path === '/dev')

const site = useSiteStore()
const selection = useSelectionStore()
const editing = useEditingStore()
const theme = useThemeStore()
const uiMode = useUiModeStore()
const unsavedGuard = useUnsavedGuardStore()
const showPublish = ref(false)
const showFetch = ref(false)

const publishItemType = computed(() => selection.type === 'page' ? 'pages' : 'fragments')
const publishItemName = computed(() => selection.name ?? '')
const canPublish = computed(() => selection.name && !editing.dirty)

async function handleBack() {
  if (editing.dirty) {
    const result = await unsavedGuard.guard()
    if (result === 'cancel') return
    if (result === 'save') await editing.save()
  }
  uiMode.enterBrowse()
}
</script>

<template>
  <Toolbar class="cms-toolbar">
    <template #start>
      <Button v-if="uiMode.mode === 'edit'" icon="pi pi-arrow-left" text rounded
        data-testid="back-to-browse" @click="handleBack" size="small" class="cms-btn" />
      <Button v-if="isDevPage" icon="pi pi-arrow-left" text rounded
        data-testid="back-to-editor" @click="router.push('/')" size="small" class="cms-btn" />
      <span class="cms-logo">
        <i class="pi pi-objects-column" />
        Gazetta
      </span>
      <span v-if="site.manifest" class="cms-site-name">{{ site.manifest.name }}</span>
    </template>
    <template #center>
      <Transition name="fade">
        <span v-if="editing.lastSaveError" class="cms-toast cms-toast-error">
          <i class="pi pi-exclamation-circle" /> {{ editing.lastSaveError }}
        </span>
        <span v-else-if="editing.dirty" class="cms-toast cms-toast-dirty">
          Unsaved changes
        </span>
      </Transition>
    </template>
    <template #end>
      <Button v-if="!isDevPage" icon="pi pi-code" text rounded title="Dev Playground"
        data-testid="dev-playground-link" @click="router.push('/dev')" size="small" class="cms-btn" />
      <Button :icon="theme.dark ? 'pi pi-sun' : 'pi pi-moon'" text rounded
        data-testid="theme-toggle" @click="theme.toggle()" size="small" class="cms-btn" />
      <Button v-if="uiMode.mode === 'edit' && editing.dirty" label="Discard" icon="pi pi-undo" severity="secondary" text
        data-testid="discard-btn" @click="editing.discard()" size="small" class="cms-btn" />
      <Button v-if="uiMode.mode === 'edit'" label="Save" icon="pi pi-save" severity="primary" :loading="editing.saving"
        data-testid="save-btn" :disabled="!editing.dirty" @click="editing.save()" size="small" class="cms-btn" />
      <Button label="Fetch" icon="pi pi-cloud-download" severity="info"
        data-testid="fetch-btn" @click="showFetch = true" size="small" class="cms-btn" />
      <Button label="Publish" icon="pi pi-cloud-upload" severity="success"
        data-testid="publish-btn" :disabled="!canPublish" @click="showPublish = true" size="small" class="cms-btn" />
    </template>
  </Toolbar>

  <PublishDialog v-if="showPublish" :visible="showPublish" :itemType="publishItemType"
    :itemName="publishItemName" @close="showPublish = false" />
  <FetchDialog v-if="showFetch" :visible="showFetch" @close="showFetch = false" />
</template>

<style scoped>
.cms-toolbar { border-radius: 0; border-left: 0; border-right: 0; border-top: 0; }
.cms-logo { font-weight: 700; font-size: 1.125rem; display: flex; align-items: center; gap: 0.5rem; }
.cms-site-name { margin-left: 1rem; color: #888; font-size: 0.875rem; }
.cms-btn { margin-left: 0.5rem; }
.cms-toast { font-size: 0.8125rem; display: flex; align-items: center; gap: 0.375rem; }
.cms-toast-error { color: #dc2626; }
.cms-toast-dirty { color: #d97706; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
