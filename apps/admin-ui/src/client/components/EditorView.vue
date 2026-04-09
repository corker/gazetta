<script setup lang="ts">
import { ref, provide, onMounted, onUnmounted } from 'vue'
import Splitter from 'primevue/splitter'
import SplitterPanel from 'primevue/splitterpanel'
import SiteTree from './SiteTree.vue'
import ComponentTree from './ComponentTree.vue'
import EditorPanel from './EditorPanel.vue'
import PreviewPanel from './PreviewPanel.vue'
import { useUiModeStore } from '../stores/uiMode.js'
import { useEditingStore } from '../stores/editing.js'

const uiMode = useUiModeStore()
const editing = useEditingStore()

const pendingGzId = ref<string | null>(null)

provide('selectByGzId', (gzId: string) => {
  pendingGzId.value = gzId
})

// Escape key exits edit mode (only when no input is focused)
function handleKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || uiMode.mode !== 'edit') return
  const active = document.activeElement as HTMLElement | null
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.isContentEditable)) return
  if (editing.dirty && !confirm('You have unsaved changes. Discard?')) return
  uiMode.enterBrowse()
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <!-- Browse mode: SiteTree + Preview -->
  <Splitter v-if="uiMode.mode === 'browse'" class="cms-editor" style="height: calc(100% - 60px)">
    <SplitterPanel :size="25" :minSize="15" class="cms-panel">
      <div class="cms-panel-content">
        <SiteTree />
      </div>
    </SplitterPanel>
    <SplitterPanel :size="75" :minSize="40" class="cms-panel">
      <PreviewPanel />
    </SplitterPanel>
  </Splitter>

  <!-- Edit mode: ComponentTree + Editor + Preview -->
  <Splitter v-else class="cms-editor" style="height: calc(100% - 60px)">
    <SplitterPanel :size="20" :minSize="15" class="cms-panel">
      <div class="cms-panel-content">
        <ComponentTree :pendingGzId="pendingGzId" @pendingConsumed="pendingGzId = null" />
      </div>
    </SplitterPanel>
    <SplitterPanel :size="35" :minSize="20" class="cms-panel">
      <div class="cms-panel-content">
        <EditorPanel />
      </div>
    </SplitterPanel>
    <SplitterPanel :size="45" :minSize="25" class="cms-panel">
      <PreviewPanel />
    </SplitterPanel>
  </Splitter>
</template>

<style scoped>
.cms-editor { border: 0; border-radius: 0; }
.cms-panel { overflow: auto; }
.cms-panel-content { padding: 1rem; }
</style>
