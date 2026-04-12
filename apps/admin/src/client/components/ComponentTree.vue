<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import { useSelectionStore } from '../stores/selection.js'
import { useEditingStore } from '../stores/editing.js'
import { useToastStore } from '../stores/toast.js'
import { usePreviewStore } from '../stores/preview.js'
import { useComponentFocusStore } from '../stores/componentFocus.js'
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

interface NodeData {
  treePath?: string
  path?: string
  template?: string
  isFragment?: boolean
  isPage?: boolean
  fragName?: string
  index?: number
  isTopLevel?: boolean
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
const preview = usePreviewStore()
const focus = useComponentFocusStore()
const selectedNodeKey = ref<string | null>(null)
const hoveredNodeKey = ref<string | null>(null)
const componentNodes = ref<ComponentNode[]>([])
const showAddDialog = ref(false)

const detail = computed(() => selection.detail)
const componentCount = computed(() => detail.value?.components?.length ?? 0)

// Map from data-gz hash → component info (built during tree construction)
type GzEntry = { path: string; template: string } | { isFragment: true; fragName: string }
const gzMap = ref(new Map<string, GzEntry>())

async function buildComponentNode(name: string, parentDir: string, index: number, parentTreePath: string, map: Map<string, GzEntry>): Promise<ComponentNode> {
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
        data: { isFragment: true, fragName, treePath, path: frag.dir, template: frag.template, index, isTopLevel: true },
        children,
      }
    } catch {
      return { key: `frag:${fragName}:${index}`, label: name, data: { isFragment: true, treePath, index, isTopLevel: true }, children: [] }
    }
  }

  const path = `${parentDir}/${name}`
  let template = ''
  let children: ComponentNode[] = []
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
    data: { path, template, treePath, isFragment: false, index, isTopLevel: true },
    children: children.map(c => ({ ...c, data: { ...c.data, isTopLevel: false } })),
  }
}

watch(detail, async (d) => {
  if (!d) { componentNodes.value = []; gzMap.value = new Map(); return }

  const map = new Map<string, GzEntry>()
  const rootPath = selection.type === 'fragment' ? `@${selection.name}` : ''
  const children = d.components
    ? await Promise.all(d.components.map((name: string, i: number) => buildComponentNode(name, d.dir, i, rootPath, map)))
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

// --- Editing helpers: build an EditingTarget with the correct save callback ---

/** Fetch schema and extract hasEditor flag + editorUrl + fieldsBaseUrl */
async function fetchSchema(template: string) {
  const response = await api.getTemplateSchema(template)
  const { hasEditor, editorUrl, fieldsBaseUrl, ...schema } = response as Record<string, unknown> & { hasEditor?: boolean; editorUrl?: string; fieldsBaseUrl?: string }
  return { schema, hasEditor: !!hasEditor, editorUrl, fieldsBaseUrl }
}

async function openComponentEditor(path: string, template: string) {
  try {
    const comp = await api.getComponent(path)
    const content = (comp.content as Record<string, unknown>) ?? {}
    const { schema, hasEditor, editorUrl, fieldsBaseUrl } = await fetchSchema(template)
    editing.open({ template, path, content, schema, hasEditor, editorUrl, fieldsBaseUrl, save: (c) => api.updateComponent(path, { content: c }).then(() => {}) })
  } catch (err) {
    toast.showError(err, 'Failed to load component')
  }
}

async function openPageContentEditor() {
  const d = detail.value
  const sel = selection.selection
  if (!d || !sel) return
  try {
    const content = (d.content as Record<string, unknown>) ?? {}
    const { schema, hasEditor, editorUrl, fieldsBaseUrl } = await fetchSchema(d.template)
    const save = sel.type === 'page'
      ? (c: Record<string, unknown>) => api.updatePage(sel.name, { content: c }).then(() => {})
      : (c: Record<string, unknown>) => api.updateFragment(sel.name, { content: c }).then(() => {})
    editing.open({ template: d.template, path: d.dir, content, schema, hasEditor, editorUrl, fieldsBaseUrl, save })
  } catch (err) {
    toast.showError(err, 'Failed to load content')
  }
}

async function openFragmentEditor(fragName: string) {
  try {
    const frag = await api.getFragment(fragName)
    const content = (frag.content as Record<string, unknown>) ?? {}
    const { schema, hasEditor, editorUrl, fieldsBaseUrl } = await fetchSchema(frag.template)
    editing.open({ template: frag.template, path: frag.dir, content, schema, hasEditor, editorUrl, fieldsBaseUrl, save: (c) => api.updateFragment(fragName, { content: c }).then(() => {}) })
  } catch (err) {
    toast.showError(err, `Failed to load fragment "${fragName}"`)
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

function onSelect(node: ComponentNode) {
  if (!node.data) return
  if (editing.dirty && !confirm('You have unsaved changes. Discard?')) return
  selectedNodeKey.value = node.key
  const treePath = node.data.treePath
  focus.select(treePath ? hashPath(treePath) : null)
  if (node.data.isFragment && node.data.fragName) {
    openFragmentEditor(node.data.fragName!)
    return
  }
  if (node.data.isPage) {
    openPageContentEditor()
    return
  }
  if (!node.data.path || !node.data.template) return
  openComponentEditor(node.data.path!, node.data.template!)
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
    openFragmentEditor(entry.fragName)
    return
  }
  const found = findNodeByKey(componentNodes.value, d => d.path === entry.path)
  if (found) selectedNodeKey.value = found.key
  openComponentEditor(entry.path, entry.template)
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
  const components = [...d.components]
  const removed = components.splice(index, 1)[0]
  editing.clear()
  await selection.updateComponents(components)
  toast.show(`Removed "${removed}"`)
}

async function addComponent(name: string, template: string) {
  const d = detail.value
  if (!d) return
  try {
    await api.createComponent(d.dir, name, template)
    const components = [...(d.components ?? []), name]
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
        <i :class="nodeIcon(node, depth)" class="node-icon" />
        <span class="node-label">{{ node.label }}</span>
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
.empty { color: #aaa; }
.node-item { display: flex; align-items: center; gap: 4px; height: 22px; padding: 0 6px; margin: 0 2px; cursor: pointer; border-radius: 3px; }
.node-item:hover, .node-item.hovered { background: rgba(128, 128, 128, 0.08); }
.node-item.selected { background: rgba(167, 139, 250, 0.15); box-shadow: inset 2px 0 0 #a78bfa; }
.node-root { font-weight: 600; padding: 0 6px; height: 26px; line-height: 26px; border-radius: 0; margin: 0 0 2px 0; border-bottom: 1px solid rgba(128, 128, 128, 0.15); }
.node-root.selected { background: rgba(167, 139, 250, 0.1); box-shadow: none; border-bottom-color: #a78bfa; }
.node-icon { width: 16px; text-align: center; font-size: 10px; color: #999; flex-shrink: 0; }
.node-label { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #6b7280; }
.node-item.selected .node-label { color: #374151; }
.node-item:hover .node-label, .node-item.hovered .node-label { color: #374151; }
.node-root .node-label { color: #1f2937; }
:global(.dark) .node-item:hover, :global(.dark) .node-item.hovered { background: rgba(255, 255, 255, 0.05); }
:global(.dark) .node-root { border-bottom-color: #27272a; }
:global(.dark) .node-icon { color: #666; }
:global(.dark) .node-label { color: #bbb; }
:global(.dark) .node-item.selected .node-label { color: #e4e4e7; }
:global(.dark) .node-item:hover .node-label, :global(.dark) .node-item.hovered .node-label { color: #e4e4e7; }
:global(.dark) .node-root .node-label { color: #e4e4e7; }
.node-actions { display: flex; gap: 0; opacity: 0; transition: opacity 0.1s; flex-shrink: 0; }
.node-item:hover .node-actions { opacity: 1; }
.add-btn { margin-top: 6px; }
</style>
