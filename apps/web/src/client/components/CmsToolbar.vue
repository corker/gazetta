<script setup lang="ts">
import Toolbar from 'primevue/toolbar'
import Button from 'primevue/button'
import { useSiteStore } from '../stores/site.js'
import { useEditorStore } from '../stores/editor.js'

const site = useSiteStore()
const editor = useEditorStore()

async function handleSave() {
  if (editor.componentContent && editor.selectedComponentPath) {
    await editor.saveComponent(editor.componentContent)
  }
}
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
    <template #end>
      <Button label="Save" icon="pi pi-save" severity="primary" :loading="editor.saving"
        :disabled="!editor.selectedComponentPath" @click="handleSave" size="small" />
    </template>
  </Toolbar>
</template>

<style scoped>
.cms-toolbar { border-radius: 0; border-left: 0; border-right: 0; border-top: 0; }
.cms-logo { font-weight: 700; font-size: 1.125rem; display: flex; align-items: center; gap: 0.5rem; }
.cms-site-name { margin-left: 1rem; color: #888; font-size: 0.875rem; }
</style>
