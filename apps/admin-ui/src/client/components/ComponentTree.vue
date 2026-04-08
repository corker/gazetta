<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Tree from 'primevue/tree'
import Button from 'primevue/button'
import type { TreeNode } from 'primevue/treenode'
import { useEditorStore } from '../stores/editor.js'
import { api } from '../api/client.js'
import AddComponentDialog from './AddComponentDialog.vue'

const editor = useEditorStore()
const selectedKey = ref<Record<string, boolean>>({})
const componentNodes = ref<TreeNode[]>([])
const showAddDialog = ref(false)

const detail = computed(() => editor.pageDetail ?? editor.fragmentDetail)
const title = computed(() => {
  if (editor.selectionType === 'page') return `Page: ${editor.selectionName}`
  if (editor.selectionType === 'fragment') return `Fragment: ${editor.selectionName}`
  return ''
})

const componentCount = computed(() => detail.value?.components?.length ?? 0)

async function buildComponentNode(name: string, parentDir: string, index: number): Promise<TreeNode> {
  const isFragment = name.startsWith('@')

  if (isFragment) {
    const fragName = name.slice(1)
    try {
      const frag = await api.getFragment(fragName)
      const children = frag.components
        ? await Promise.all(frag.components.map((c: string, i: number) => buildComponentNode(c, frag.dir, i)))
        : []
      return {
        key: `frag:${fragName}:${index}`,
        label: name,
        icon: 'pi pi-share-alt',
        data: { isFragment: true, fragName, index, isTopLevel: true },
        children,
      }
    } catch {
      return { key: `frag:${fragName}:${index}`, label: name, icon: 'pi pi-share-alt', data: { isFragment: true, index, isTopLevel: true } }
    }
  }

  const path = `${parentDir}/${name}`
  let template = ''
  let children: TreeNode[] = []
  try {
    const comp = await api.getComponent(path)
    template = (comp.template as string) ?? ''
    if (comp.components) {
      children = await Promise.all(
        (comp.components as string[]).map((c: string, i: number) => buildComponentNode(c, path, i))
      )
    }
  } catch { /* component may not have manifest */ }

  return {
    key: `comp:${path}:${index}`,
    label: name,
    icon: 'pi pi-box',
    data: { path, template, isFragment: false, index, isTopLevel: true },
    children: children.map(c => ({ ...c, data: { ...c.data, isTopLevel: false } })),
  }
}

watch(detail, async (d) => {
  if (!d || !d.components) { componentNodes.value = []; return }
  const children = await Promise.all(
    d.components.map((name: string, i: number) => buildComponentNode(name, d.dir, i))
  )

  // Page/fragment itself as the root clickable node
  const rootNode: TreeNode = {
    key: `root:${editor.selectionName}`,
    label: editor.selectionName ?? '',
    icon: editor.selectionType === 'page' ? 'pi pi-file' : 'pi pi-share-alt',
    data: { isPage: true, path: d.dir, template: d.template },
    children,
  }
  componentNodes.value = [rootNode]
  expandedKeys.value = { [`root:${editor.selectionName}`]: true }
}, { immediate: true })

const expandedKeys = ref<Record<string, boolean>>({})

function onSelect(node: TreeNode) {
  if (!node.data) return
  // Fragments have no editor form — toggle expand instead
  if (node.data.isFragment) {
    const key = node.key as string
    expandedKeys.value = { ...expandedKeys.value, [key]: !expandedKeys.value[key] }
    return
  }
  // Page/fragment root node — edit page content
  if (node.data.isPage) {
    editor.selectPageContent()
    return
  }
  if (!node.data.path || !node.data.template) return
  editor.selectComponent(node.data.path, node.data.template)
}
</script>

<template>
  <div v-if="detail" class="component-tree">
    <h3>{{ title }}</h3>
    <p class="component-template">Template: {{ detail.template }}</p>

    <Tree v-if="componentNodes.length" :value="componentNodes" v-model:selectionKeys="selectedKey"
      v-model:expandedKeys="expandedKeys"
      selectionMode="single" @node-select="onSelect" class="tree">
      <template #default="{ node }">
        <div class="node-row" :data-testid="`component-${node.data?.isFragment ? node.data.fragName : node.label}`">
          <span class="node-label">{{ node.label }}</span>
          <span v-if="node.data?.template" class="node-template">{{ node.data.template }}</span>
          <span v-if="node.data?.isTopLevel" class="node-actions">
            <Button icon="pi pi-arrow-up" text rounded size="small"
              :data-testid="`move-up-${node.label}`"
              :disabled="node.data.index === 0"
              @click.stop="editor.moveComponent(node.data.index, -1)" />
            <Button icon="pi pi-arrow-down" text rounded size="small"
              :data-testid="`move-down-${node.label}`"
              :disabled="node.data.index === componentCount - 1"
              @click.stop="editor.moveComponent(node.data.index, 1)" />
            <Button icon="pi pi-trash" text rounded size="small" severity="danger"
              :data-testid="`remove-${node.label}`"
              @click.stop="editor.removeComponent(node.data.index)" />
          </span>
        </div>
      </template>
    </Tree>
    <p v-else class="empty">No components</p>

    <Button icon="pi pi-plus" label="Add component" text size="small" class="add-btn"
      data-testid="add-component" @click="showAddDialog = true" />

    <AddComponentDialog v-if="showAddDialog" :visible="showAddDialog"
      @close="showAddDialog = false" />
  </div>
</template>

<style scoped>
.component-tree { margin-top: 1.5rem; }
.component-tree h3 { font-size: 0.75rem; text-transform: uppercase; color: #888; margin-bottom: 0.5rem; letter-spacing: 0.05em; }
.component-template { font-size: 0.75rem; color: #aaa; margin-bottom: 0.5rem; }
.tree { font-size: 0.875rem; }
.empty { font-size: 0.875rem; color: #aaa; }
.node-row { display: flex; align-items: center; gap: 0.5rem; width: 100%; }
.node-label { flex: 1; }
.node-template { font-size: 0.6875rem; color: #666; }
.node-actions { display: flex; gap: 0; opacity: 0; transition: opacity 0.15s; }
.node-row:hover .node-actions { opacity: 1; }
.add-btn { margin-top: 0.5rem; }
</style>
