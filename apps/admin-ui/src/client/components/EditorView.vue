<script setup lang="ts">
import Splitter from 'primevue/splitter'
import SplitterPanel from 'primevue/splitterpanel'
import SiteTree from './SiteTree.vue'
import ComponentTree from './ComponentTree.vue'
import EditorPanel from './EditorPanel.vue'
import PreviewPanel from './PreviewPanel.vue'
</script>

<template>
  <Splitter class="cms-editor" style="height: calc(100% - 60px)">
    <SplitterPanel :size="20" :minSize="15" class="cms-panel">
      <div class="cms-panel-content">
        <SiteTree />
        <ComponentTree />
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
