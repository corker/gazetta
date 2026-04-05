<script setup lang="ts">
import { computed, ref } from 'vue'
import Tree from 'primevue/tree'
import Button from 'primevue/button'
import type { TreeNode } from 'primevue/treenode'
import { useSiteStore } from '../stores/site.js'
import { useEditorStore } from '../stores/editor.js'
import { api } from '../api/client.js'
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

async function handleDelete(node: TreeNode) {
  if (!node.data) return
  const name = node.data.name
  const type = node.data.type

  if (!confirm(`Delete ${type} "${name}"? This cannot be undone.`)) return

  try {
    if (type === 'page') await api.deletePage(name)
    else if (type === 'fragment') await api.deleteFragment(name)
    editor.clearComponentSelection()
    await site.load()
  } catch (err) {
    alert(`Failed to delete: ${(err as Error).message}`)
  }
}
</script>

<template>
  <div class="site-tree">
    <h3>Site</h3>
    <Tree :value="nodes" v-model:selectionKeys="selectedKey" selectionMode="single"
      @node-select="onSelect" class="tree">
      <template #default="{ node }">
        <div class="node-row">
          <span class="node-label">{{ node.label }}</span>
          <Button v-if="node.data" icon="pi pi-trash" text rounded size="small" severity="danger"
            class="node-delete" @click.stop="handleDelete(node)" />
        </div>
      </template>
    </Tree>
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
.node-row { display: flex; align-items: center; gap: 0.25rem; width: 100%; }
.node-label { flex: 1; }
.node-delete { opacity: 0; transition: opacity 0.15s; }
.node-row:hover .node-delete { opacity: 1; }
</style>
