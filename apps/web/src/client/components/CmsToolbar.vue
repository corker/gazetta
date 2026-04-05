<script setup lang="ts">
import Toolbar from 'primevue/toolbar'
import Button from 'primevue/button'
import { useSiteStore } from '../stores/site.js'
import { useEditorStore } from '../stores/editor.js'

const site = useSiteStore()
const editor = useEditorStore()
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
        <span v-if="editor.lastSaveSuccess" class="cms-toast cms-toast-success">
          <i class="pi pi-check-circle" /> Saved
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
      <Button v-if="editor.dirty" label="Discard" icon="pi pi-undo" severity="secondary" text
        @click="editor.discardChanges()" size="small" class="cms-btn" />
      <Button label="Save" icon="pi pi-save" severity="primary" :loading="editor.saving"
        :disabled="!editor.dirty" @click="editor.saveComponent()" size="small" class="cms-btn" />
    </template>
  </Toolbar>
</template>

<style scoped>
.cms-toolbar { border-radius: 0; border-left: 0; border-right: 0; border-top: 0; }
.cms-logo { font-weight: 700; font-size: 1.125rem; display: flex; align-items: center; gap: 0.5rem; }
.cms-site-name { margin-left: 1rem; color: #888; font-size: 0.875rem; }
.cms-btn { margin-left: 0.5rem; }
.cms-toast { font-size: 0.8125rem; display: flex; align-items: center; gap: 0.375rem; }
.cms-toast-success { color: #16a34a; }
.cms-toast-error { color: #dc2626; }
.cms-toast-dirty { color: #d97706; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
