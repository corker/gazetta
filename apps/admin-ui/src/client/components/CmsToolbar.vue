<script setup lang="ts">
import { ref, computed } from 'vue'
import Toolbar from 'primevue/toolbar'
import Button from 'primevue/button'
import { useSiteStore } from '../stores/site.js'
import { useEditorStore } from '../stores/editor.js'
import { useThemeStore } from '../stores/theme.js'
import PublishDialog from './PublishDialog.vue'
import FetchDialog from './FetchDialog.vue'

const site = useSiteStore()
const editor = useEditorStore()
const theme = useThemeStore()
const showPublish = ref(false)
const showFetch = ref(false)

const publishItemType = computed(() => editor.selectionType === 'page' ? 'pages' : 'fragments')
const publishItemName = computed(() => editor.selectionName ?? '')
const canPublish = computed(() => editor.selectionName && !editor.dirty)
</script>

<template>
  <Toolbar class="cms-toolbar">
    <template #start>
      <span class="cms-logo">
        <i class="pi pi-objects-column" />
        Gazetta
      </span>
      <span v-if="site.manifest" class="cms-site-name">{{ site.manifest.name }}</span>
    </template>
    <template #center>
      <Transition name="fade">
        <span v-if="editor.toast" class="cms-toast" :class="editor.toast.type === 'error' ? 'cms-toast-error' : 'cms-toast-success'">
          <i :class="editor.toast.type === 'error' ? 'pi pi-exclamation-circle' : 'pi pi-check-circle'" />
          <a v-if="editor.toast.link" :href="editor.toast.link" target="_blank" rel="noopener" class="cms-toast-link">{{ editor.toast.message }}</a>
          <template v-else>{{ editor.toast.message }}</template>
        </span>
        <span v-else-if="editor.lastSaveError" class="cms-toast cms-toast-error">
          <i class="pi pi-exclamation-circle" /> {{ editor.lastSaveError }}
        </span>
        <span v-else-if="editor.dirty" class="cms-toast cms-toast-dirty">
          Unsaved changes
        </span>
      </Transition>
    </template>
    <template #end>
      <Button :icon="theme.dark ? 'pi pi-sun' : 'pi pi-moon'" text rounded
        data-testid="theme-toggle" @click="theme.toggle()" size="small" class="cms-btn" />
      <Button v-if="editor.dirty" label="Discard" icon="pi pi-undo" severity="secondary" text
        data-testid="discard-btn" @click="editor.discardChanges()" size="small" class="cms-btn" />
      <Button label="Save" icon="pi pi-save" severity="primary" :loading="editor.saving"
        data-testid="save-btn" :disabled="!editor.dirty" @click="editor.saveComponent()" size="small" class="cms-btn" />
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
.cms-toast-success { color: #16a34a; }
.cms-toast-error { color: #dc2626; }
.cms-toast-link { color: inherit; text-decoration: underline; }
.cms-toast-dirty { color: #d97706; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
