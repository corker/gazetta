<script setup lang="ts">
import { computed, ref } from 'vue'
import Tree from 'primevue/tree'
import Button from 'primevue/button'
import type { TreeNode } from 'primevue/treenode'
import { useSiteStore } from '../stores/site.js'
import { useEditorStore } from '../stores/editor.js'
import CreatePageDialog from './CreatePageDialog.vue'

const site = useSiteStore()
const editor = useEditorStore()
const selectedKey = ref<Record<string, boolean>>({})
const showCreatePage = ref(false)

const nodes = computed<TreeNode[]>(() => [
  {
    key: 'pages',
    label: 'Pages',
    icon: 'pi pi-file',
    selectable: false,
    children: site.pages.map(p => ({
      key: `page:${p.name}`,
      label: p.name,
      icon: 'pi pi-file',
      data: { type: 'page' as const, name: p.name },
    })),
  },
  {
    key: 'fragments',
    label: 'Fragments',
    icon: 'pi pi-share-alt',
    selectable: false,
    children: site.fragments.map(f => ({
      key: `fragment:${f.name}`,
      label: f.name,
      icon: 'pi pi-share-alt',
      data: { type: 'fragment' as const, name: f.name },
    })),
  },
])

function onSelect(node: TreeNode) {
  if (!node.data) return
  if (node.data.type === 'page') editor.selectPage(node.data.name)
  else if (node.data.type === 'fragment') editor.selectFragment(node.data.name)
}
</script>

<template>
  <div class="site-tree">
    <h3>Site</h3>
    <Tree :value="nodes" v-model:selectionKeys="selectedKey" selectionMode="single"
      @node-select="onSelect" class="tree" />
    <Button icon="pi pi-plus" label="New page" text size="small" class="new-btn"
      @click="showCreatePage = true" />
    <CreatePageDialog v-if="showCreatePage" :visible="showCreatePage"
      @close="showCreatePage = false" />
  </div>
</template>

<style scoped>
.site-tree h3 { font-size: 0.75rem; text-transform: uppercase; color: #888; margin-bottom: 0.5rem; letter-spacing: 0.05em; }
.tree { font-size: 0.875rem; }
.new-btn { margin-top: 0.5rem; }
</style>
