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
  if (e.key !== 'Escape') return
  // Fullscreen: close it first
  if (uiMode.fullscreen) { uiMode.toggleFullscreen(); return }
  if (uiMode.mode !== 'edit') return
  const active = document.activeElement as HTMLElement | null
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.isContentEditable)) {
    // First Escape: blur the focused input. Second Escape: exit edit mode.
    ;(active as HTMLElement).blur()
    return
  }
  if (editing.dirty && !confirm('You have unsaved changes. Discard?')) return
  uiMode.enterBrowse()
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <div class="cms-editor">
    <div class="cms-left" :class="{ 'cms-left-wide': uiMode.mode === 'edit' }">
      <!-- Browse: SiteTree -->
      <div v-if="uiMode.mode === 'browse'" class="cms-panel-content">
        <SiteTree />
      </div>
      <!-- Edit: ComponentTree + Editor with drag-to-resize -->
      <Splitter v-else class="cms-splitter">
        <SplitterPanel :size="40" :minSize="30" class="cms-panel">
          <div class="cms-panel-content">
            <ComponentTree :pendingGzId="pendingGzId" @pendingConsumed="pendingGzId = null" />
          </div>
        </SplitterPanel>
        <SplitterPanel :size="60" :minSize="30" class="cms-panel">
          <div class="cms-panel-content">
            <EditorPanel />
          </div>
        </SplitterPanel>
      </Splitter>
    </div>
    <div class="cms-preview">
      <PreviewPanel />
    </div>
  </div>
</template>

<style scoped>
.cms-editor { display: flex; height: calc(100% - 60px); }
.cms-left { width: 250px; flex-shrink: 0; overflow: auto; border-right: 1px solid #27272a; }
.cms-left-wide { width: 550px; overflow: hidden; }
.cms-splitter { height: 100%; border: 0; border-radius: 0; }
.cms-preview { flex: 1; min-width: 0; overflow: hidden; }
.cms-panel { overflow: auto; }
.cms-panel-content { padding: 1rem; }
</style>
