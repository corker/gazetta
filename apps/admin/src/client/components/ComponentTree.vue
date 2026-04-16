<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import { useSelectionStore } from '../stores/selection.js'
import { useEditingStore } from '../stores/editing.js'
import { useToastStore } from '../stores/toast.js'
import { useComponentFocusStore } from '../stores/componentFocus.js'
import { useUnsavedGuardStore } from '../stores/unsavedGuard.js'
import { useFragmentsApi } from '../composables/api.js'
import AddComponentDialog from './AddComponentDialog.vue'

const fragmentsApi = useFragmentsApi()

/** FNV-1a hash — same function as in packages/gazetta/src/scope.ts */
function hashPath(path: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < path.length; i++) {
    hash ^= path.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

interface NodeData {
  treePath?: string
  path?: string
  template?: string
  isFragment?: boolean
  isPage?: boolean
  fragName?: string
  index?: number
  isTopLevel?: boolean
  error?: string
}

interface ComponentNode {
  key: string
  label: string
  data: NodeData
  children: ComponentNode[]
}

const selection = useSelectionStore()
const editing = useEditingStore()
const toast = useToastStore()
const focus = useComponentFocusStore()
const unsavedGuard = useUnsavedGuardStore()
const selectedNodeKey = ref<string | null>(null)
const hoveredNodeKey = ref<string | null>(null)
const componentNodes = ref<ComponentNode[]>([])
const showAddDialog = ref(false)

const detail = computed(() => selection.detail)
const componentCount = computed(() => detail.value?.components?.length ?? 0)

// Map from data-gz hash → component info (built during tree construction)
type GzEntry = { path: string; template: string } | { isFragment: true; fragName: string }
const gzMap = ref(new Map<string, GzEntry>())

async function buildComponentNode(entry: import('../api/client.js').ComponentEntry, index: number, parentTreePath: string, map: Map<string, GzEntry>): Promise<ComponentNode> {
  // Fragment reference
  if (typeof entry === 'string') {
    const fragName = entry.slice(1)
    const treePath = parentTreePath ? `${parentTreePath}/${entry}` : entry
    const gzId = hashPath(treePath)
    map.set(gzId, { isFragment: true, fragName })
    try {
      const frag = await fragmentsApi.getFragment(fragName)
      const children = frag.components
        ? await Promise.all(frag.components.map((c, i) => buildComponentNode(c, i, treePath, map)))
        : []
      return {
        key: `frag:${fragName}:${index}`,
        label: entry,
        data: { isFragment: true, fragName, treePath, path: treePath, template: frag.template, index, isTopLevel: true },
        children,
      }
    } catch (err) {
      return { key: `frag:${fragName}:${index}`, label: entry, data: { isFragment: true, fragName, treePath, index, isTopLevel: true, error: (err as Error).message }, children: [] }
    }
  }

  // Inline component
  const treePath = parentTreePath ? `${parentTreePath}/${entry.name}` : entry.name
  const gzId = hashPath(treePath)
  const children: ComponentNode[] = entry.components
    ? await Promise.all(entry.components.map((c, i) => buildComponentNode(c, i, treePath, map)))
    : []

  map.set(gzId, { path: treePath, template: entry.template })

  return {
    key: `comp:${treePath}:${index}`,
    label: entry.name,
    data: { path: treePath, template: entry.template, treePath, isFragment: false, index, isTopLevel: true },
    children: children.map(c => ({ ...c, data: { ...c.data, isTopLevel: false } })),
  }
}

watch(detail, async (d) => {
  if (!d) { componentNodes.value = []; gzMap.value = new Map(); return }

  const map = new Map<string, GzEntry>()
  const rootPath = selection.type === 'fragment' ? `@${selection.name}` : ''
  const children = d.components
    ? await Promise.all(d.components.map((entry, i) => buildComponentNode(entry, i, rootPath, map)))
    : []

  const rootNode: ComponentNode = {
    key: `root:${selection.name}`,
    label: selection.name ?? '',
    data: { isPage: true, path: d.dir, template: d.template, treePath: rootPath },
    children,
  }
  // Fragment root has data-gz in host-page preview — add to gzMap for click-to-select
  if (rootPath && selection.type === 'fragment' && selection.name) {
    map.set(hashPath(rootPath), { isFragment: true, fragName: selection.name })
  }
  componentNodes.value = [rootNode]
  gzMap.value = map

  // Process pending selection if tree just built and a gzId is waiting
  consumePending()
}, { immediate: true })

function consumePending() {
  if (focus.pendingGzId && gzMap.value.size > 0) {
    selectByGzId(focus.pendingGzId)
    focus.clearPending()
  }
}

// Also react to pendingGzId changes when tree is already built (edit mode click-to-select)
watch(() => focus.pendingGzId, () => consumePending())

// Highlight tree node when component is hovered in preview
watch(() => focus.previewHoverGzId, (gzId) => {
  if (!gzId) { hoveredNodeKey.value = null; return }
  const found = findNodeByKey(componentNodes.value, d => d.treePath ? hashPath(d.treePath) === gzId : false)
  hoveredNodeKey.value = found?.key ?? null
})

// Flat list for rendering — walk tree and produce { node, depth } pairs
const flatNodes = computed(() => {
  const result: { node: ComponentNode; depth: number }[] = []
  function walk(nodes: ComponentNode[], depth: number) {
    for (const node of nodes) {
      result.push({ node, depth })
      if (node.children.length) walk(node.children, depth + 1)
    }
  }
  if (componentNodes.value[0]) {
    result.push({ node: componentNodes.value[0], depth: -1 })
    walk(componentNodes.value[0].children, 0)
  }
  return result
})

function nodeIcon(node: ComponentNode, depth: number): string {
  if (depth === -1) return selection.type === 'page' ? 'pi pi-file' : 'pi pi-share-alt'
  if (node.data.isFragment) return 'pi pi-share-alt'
  return 'pi pi-box'
}

function nodeStyle(depth: number): Record<string, string> | undefined {
  if (depth <= 0) return undefined
  return { paddingLeft: depth * 10 + 'px' }
}

// --- Editing helpers — delegated to editing store ---

function revertComponent(componentPath: string) {
  if (editing.path === componentPath) {
    editing.discard()
  } else {
    editing.revertStashed(componentPath)
  }
}

// --- Hover highlight ---

function onHover(node: ComponentNode) {
  if (!node.data.treePath) return
  focus.highlight(hashPath(node.data.treePath!))
}

function onHoverEnd() {
  focus.highlight(null)
}

// --- Node selection ---

async function onSelect(node: ComponentNode) {
  if (!node.data) return
  selectedNodeKey.value = node.key
  focus.clearPending()
  const treePath = node.data.treePath
  focus.select(treePath ? hashPath(treePath) : null)
  if (node.data.isFragment && node.data.fragName) {
    editing.openFragment(node.data.fragName!)
    return
  }
  if (node.data.isPage) {
    editing.openPageRoot()
    return
  }
  if (!node.data.path) return
  editing.openComponent(node.data.path!, node.data.template ?? '')
}

// Find a node by walking the tree
function findNodeByKey(nodes: ComponentNode[], predicate: (data: NodeData) => boolean): ComponentNode | null {
  for (const node of nodes) {
    if (node.data && predicate(node.data)) return node
    if (node.children.length) {
      const found = findNodeByKey(node.children, predicate)
      if (found) return found
    }
  }
  return null
}

// Select a component by its data-gz hash (called from PreviewPanel)
function selectByGzId(gzId: string) {
  const entry = gzMap.value.get(gzId)
  if (!entry) return
  focus.select(gzId)
  if ('isFragment' in entry) {
    const found = findNodeByKey(componentNodes.value, d => d.fragName === entry.fragName)
    if (found) selectedNodeKey.value = found.key
    editing.openFragment(entry.fragName)
    return
  }
  const found = findNodeByKey(componentNodes.value, d => d.path === entry.path)
  if (found) selectedNodeKey.value = found.key
  editing.openComponent(entry.path, entry.template)
}

// --- Component operations ---

async function moveComponent(index: number, direction: -1 | 1) {
  const d = detail.value
  if (!d?.components) return
  const newIndex = index + direction
  if (newIndex < 0 || newIndex >= d.components.length) return
  const components = [...d.components]
  const [moved] = components.splice(index, 1)
  components.splice(newIndex, 0, moved)
  await selection.updateComponents(components)
}

async function removeComponent(index: number) {
  const d = detail.value
  if (!d?.components) return
  if (editing.dirty) {
    const result = await unsavedGuard.guard()
    if (result === 'cancel') return
    if (result === 'save') await editing.save()
  }
  const components = [...d.components]
  const removed = components.splice(index, 1)[0]
  const removedName = typeof removed === 'string' ? removed : removed.name
  editing.clear()
  await selection.updateComponents(components)
  toast.show(`Removed "${removedName}"`)
}

async function addComponent(name: string, template: string) {
  const d = detail.value
  if (!d) return
  try {
    const entry: import('../api/client.js').InlineComponent = { name, template, content: {} }
    const components = [...(d.components ?? []), entry]
    await selection.updateComponents(components)
    toast.show(`Added "${name}"`)
  } catch (err) {
    toast.showError(err, `Failed to add component "${name}"`)
  }
}
</script>

<template>
  <div v-if="detail" class="component-tree">
    <template v-if="flatNodes.length">
      <div v-for="{ node, depth } in flatNodes" :key="node.key"
        :class="['node-item', { 'node-root': depth === -1, selected: selectedNodeKey === node.key, hovered: hoveredNodeKey === node.key }]"
        :style="nodeStyle(depth)"
        :data-testid="`component-${node.data?.isFragment ? node.data.fragName : node.label}`"
        @click="onSelect(node)"
        @mouseenter="onHover(node)"
        @mouseleave="onHoverEnd()">
        <i v-if="node.data?.error" class="pi pi-exclamation-triangle node-icon node-error-icon"
          :title="node.data.error" />
        <i v-else :class="nodeIcon(node, depth)" class="node-icon" />
        <span v-if="node.data?.path && (editing.hasPendingEdit(node.data.path) || (editing.dirty && editing.path === node.data.path))" class="node-dirty-dot" />
        <span class="node-label">{{ node.label }}</span>
        <Button v-if="node.data?.path && (editing.hasPendingEdit(node.data.path) || (editing.dirty && editing.path === node.data.path))"
          icon="pi pi-undo" text rounded size="small" class="node-revert"
          title="Discard changes" @click.stop="revertComponent(node.data.path!)" />
        <span v-if="node.data?.isTopLevel && depth !== -1" class="node-actions">
          <Button icon="pi pi-arrow-up" text rounded size="small"
            :data-testid="`move-up-${node.label}`"
            :disabled="(node.data.index as number) === 0"
            @click.stop="moveComponent(node.data.index as number, -1)" />
          <Button icon="pi pi-arrow-down" text rounded size="small"
            :data-testid="`move-down-${node.label}`"
            :disabled="(node.data.index as number) === componentCount - 1"
            @click.stop="moveComponent(node.data.index as number, 1)" />
          <Button icon="pi pi-trash" text rounded size="small" severity="danger"
            :data-testid="`remove-${node.label}`"
            @click.stop="removeComponent(node.data.index as number)" />
        </span>
      </div>
    </template>
    <p v-else class="empty">No components</p>

    <Button icon="pi pi-plus" label="Add component" text size="small" class="add-btn"
      data-testid="add-component" @click="showAddDialog = true" />

    <AddComponentDialog v-if="showAddDialog" :visible="showAddDialog"
      @close="showAddDialog = false" @add="addComponent" />
  </div>
</template>

<style scoped>
.component-tree { font-size: 13px; line-height: 22px; }
.empty { color: var(--color-muted); }
.node-item { display: flex; align-items: center; gap: 4px; height: 22px; padding: 0 6px; margin: 0 2px; cursor: pointer; border-radius: 3px; }
.node-item:hover, .node-item.hovered { background: var(--color-hover-bg); }
.node-item.selected { background: rgba(167, 139, 250, 0.15); box-shadow: inset 2px 0 0 var(--p-violet-400); }
.node-root { font-weight: 600; padding: 0 6px; height: 26px; line-height: 26px; border-radius: 0; margin: 0 0 2px 0; border-bottom: 1px solid var(--color-border); }
.node-root.selected { background: rgba(167, 139, 250, 0.1); box-shadow: none; border-bottom-color: var(--p-violet-400); }
.node-icon { width: 16px; text-align: center; font-size: 10px; color: var(--color-muted); flex-shrink: 0; }
.node-label { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--color-muted); }
.node-item.selected .node-label,
.node-item:hover .node-label,
.node-item.hovered .node-label,
.node-root .node-label { color: var(--color-fg); }
.node-error-icon { color: var(--color-danger-fg); }
.node-dirty-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--color-warning-fg); flex-shrink: 0; }
.node-revert { opacity: 0; transition: opacity 0.1s; width: 18px; height: 18px; flex-shrink: 0; }
.node-item:hover .node-revert { opacity: 1; }
.node-actions { display: flex; gap: 0; opacity: 0; transition: opacity 0.1s; flex-shrink: 0; }
.node-item:hover .node-actions { opacity: 1; }
.add-btn { margin-top: 6px; }
</style>
