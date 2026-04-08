<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Tree from 'primevue/tree'
import Button from 'primevue/button'
import type { TreeNode } from 'primevue/treenode'
import { useEditorStore } from '../stores/editor.js'
import { api } from '../api/client.js'
import AddComponentDialog from './AddComponentDialog.vue'

/** FNV-1a hash — same function as in packages/gazetta/src/scope.ts */
function hashPath(path: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < path.length; i++) {
    hash ^= path.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

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

// Map from data-gz hash → component info (built during tree construction)
type GzEntry = { path: string; template: string } | { isFragment: true; fragName: string }
const gzMap = ref(new Map<string, GzEntry>())


async function buildComponentNode(name: string, parentDir: string, index: number, parentTreePath: string, map: Map<string, GzEntry>): Promise<TreeNode> {
  const treePath = parentTreePath ? `${parentTreePath}/${name}` : name
  const gzId = hashPath(treePath)
  const isFragment = name.startsWith('@')

  if (isFragment) {
    const fragName = name.slice(1)
    map.set(gzId, { isFragment: true, fragName })
    try {
      const frag = await api.getFragment(fragName)
      const children = frag.components
        ? await Promise.all(frag.components.map((c: string, i: number) => buildComponentNode(c, frag.dir, i, treePath, map)))
        : []
      return {
        key: `frag:${fragName}:${index}`,
        label: name,
        icon: 'pi pi-share-alt',
        data: { isFragment: true, fragName, treePath, index, isTopLevel: true },
        children,
      }
    } catch {
      return { key: `frag:${fragName}:${index}`, label: name, icon: 'pi pi-share-alt', data: { isFragment: true, treePath, index, isTopLevel: true } }
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
        (comp.components as string[]).map((c: string, i: number) => buildComponentNode(c, path, i, treePath, map))
      )
    }
  } catch { /* component may not have manifest */ }

  map.set(gzId, { path, template })

  return {
    key: `comp:${path}:${index}`,
    label: name,
    icon: 'pi pi-box',
    data: { path, template, treePath, isFragment: false, index, isTopLevel: true },
    children: children.map(c => ({ ...c, data: { ...c.data, isTopLevel: false } })),
  }
}

watch(detail, async (d) => {
  if (!d || !d.components) { componentNodes.value = []; gzMap.value = new Map(); return }

  const map = new Map<string, GzEntry>()
  const children = await Promise.all(
    d.components.map((name: string, i: number) => buildComponentNode(name, d.dir, i, '', map))
  )

  // Page/fragment itself as the root clickable node
  const rootNode: TreeNode = {
    key: `root:${editor.selectionName}`,
    label: editor.selectionName ?? '',
    icon: editor.selectionType === 'page' ? 'pi pi-file' : 'pi pi-share-alt',
    data: { isPage: true, path: d.dir, template: d.template, treePath: '' },
    children,
  }
  componentNodes.value = [rootNode]
  expandedKeys.value = { [`root:${editor.selectionName}`]: true }
  gzMap.value = map
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

// Find a tree node by walking the tree, return the node and its ancestor keys
function findNodeByData(nodes: TreeNode[], predicate: (data: Record<string, unknown>) => boolean, ancestors: string[] = []): { node: TreeNode; ancestors: string[] } | null {
  for (const node of nodes) {
    if (node.data && predicate(node.data as Record<string, unknown>)) {
      return { node, ancestors }
    }
    if (node.children) {
      const found = findNodeByData(node.children, predicate, [...ancestors, node.key as string])
      if (found) return found
    }
  }
  return null
}

// Select a component by its data-gz hash (called from PreviewPanel)
function selectByGzId(gzId: string) {
  const entry = gzMap.value.get(gzId)
  if (!entry) return
  if ('isFragment' in entry) {
    // Expand the fragment in the tree and select it
    const found = findNodeByData(componentNodes.value, d => d.fragName === entry.fragName)
    if (found) {
      const expanded = { ...expandedKeys.value }
      for (const key of found.ancestors) expanded[key] = true
      expanded[found.node.key as string] = true
      expandedKeys.value = expanded
      selectedKey.value = { [found.node.key as string]: true }
    }
    return
  }
  // Expand ancestors and select the node in the tree
  const found = findNodeByData(componentNodes.value, d => d.path === entry.path)
  if (found) {
    const expanded = { ...expandedKeys.value }
    for (const key of found.ancestors) expanded[key] = true
    expandedKeys.value = expanded
    selectedKey.value = { [found.node.key as string]: true }
  }
  editor.selectComponent(entry.path, entry.template)
}

defineExpose({ selectByGzId })
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
