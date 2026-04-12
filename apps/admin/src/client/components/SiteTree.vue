<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import { useSiteStore } from '../stores/site.js'
import { useSelectionStore } from '../stores/selection.js'
import { useEditingStore } from '../stores/editing.js'
import { useToastStore } from '../stores/toast.js'
import { useUnsavedGuardStore } from '../stores/unsavedGuard.js'
import { api } from '../api/client.js'
import CreatePageDialog from './CreatePageDialog.vue'
import CreateFragmentDialog from './CreateFragmentDialog.vue'

interface SiteNode {
  key: string
  label: string
  type: 'page' | 'fragment'
  name: string
  icon: string
}

const site = useSiteStore()
const selection = useSelectionStore()
const editing = useEditingStore()
const unsavedGuard = useUnsavedGuardStore()
const toast = useToastStore()
const selectedKey = ref<string | null>(null)
const showCreatePage = ref(false)
const showCreateFragment = ref(false)

// Sync selection when changed externally (e.g. preview link click)
watch(() => selection.selection, (sel) => {
  if (sel) selectedKey.value = `${sel.type}:${sel.name}`
  else selectedKey.value = null
})

const systemPageNames = computed(() => new Set(site.manifest?.systemPages ?? []))

const contentPages = computed<SiteNode[]>(() =>
  [...site.pages]
    .filter(p => !systemPageNames.value.has(p.name))
    .sort((a, b) => a.route.localeCompare(b.route))
    .map(p => ({ key: `page:${p.name}`, label: p.name, type: 'page' as const, name: p.name, icon: 'pi pi-file' }))
)

const systemPages = computed<SiteNode[]>(() =>
  [...site.pages]
    .filter(p => systemPageNames.value.has(p.name))
    .sort((a, b) => a.route.localeCompare(b.route))
    .map(p => ({ key: `page:${p.name}`, label: p.name, type: 'page' as const, name: p.name, icon: 'pi pi-file' }))
)

const fragments = computed<SiteNode[]>(() =>
  site.fragments
    .map(f => ({ key: `fragment:${f.name}`, label: f.name, type: 'fragment' as const, name: f.name, icon: 'pi pi-share-alt' }))
    .sort((a, b) => a.label.localeCompare(b.label))
)

async function onSelect(node: SiteNode) {
  if (editing.dirty) {
    const result = await unsavedGuard.guard()
    if (result === 'cancel') return
    if (result === 'save') await editing.save()
  }
  editing.clear()
  selectedKey.value = node.key
  if (node.type === 'page') selection.selectPage(node.name)
  else selection.selectFragment(node.name)
}

async function handleDelete(node: SiteNode, e: Event) {
  e.stopPropagation()
  if (!confirm(`Delete ${node.type} "${node.name}"? This cannot be undone.`)) return
  try {
    if (node.type === 'page') await api.deletePage(node.name)
    else await api.deleteFragment(node.name)
    const isSelected = selection.type === node.type && selection.name === node.name
    if (isSelected) editing.clear()
    await site.load()
  } catch (err) {
    toast.showError(err, `Failed to delete "${node.name}"`)
  }
}
</script>

<template>
  <div class="site-tree">
    <!-- Pages -->
    <div class="section-label">Pages</div>
    <div v-for="node in contentPages" :key="node.key"
      :class="['node-item', { selected: selectedKey === node.key }]"
      :data-testid="`site-${node.type}-${node.name}`"
      @click="onSelect(node)">
      <i :class="node.icon" class="node-icon" />
      <span class="node-label">{{ node.label }}</span>
      <Button icon="pi pi-trash" text rounded size="small" severity="danger"
        class="node-delete" :data-testid="`delete-${node.type}-${node.name}`"
        @click="handleDelete(node, $event)" />
    </div>

    <!-- System pages -->
    <template v-if="systemPages.length">
      <div class="section-divider" />
      <div v-for="node in systemPages" :key="node.key"
        :class="['node-item', { selected: selectedKey === node.key }]"
        :data-testid="`site-${node.type}-${node.name}`"
        @click="onSelect(node)">
        <i :class="node.icon" class="node-icon" />
        <span class="node-label">{{ node.label }}</span>
        <Button icon="pi pi-trash" text rounded size="small" severity="danger"
          class="node-delete" :data-testid="`delete-${node.type}-${node.name}`"
          @click="handleDelete(node, $event)" />
      </div>
    </template>

    <!-- Fragments -->
    <div class="section-label" style="margin-top: 12px;">Fragments</div>
    <div v-for="node in fragments" :key="node.key"
      :class="['node-item', { selected: selectedKey === node.key }]"
      :data-testid="`site-${node.type}-${node.name}`"
      @click="onSelect(node)">
      <i :class="node.icon" class="node-icon" />
      <span class="node-label">{{ node.label }}</span>
      <Button icon="pi pi-trash" text rounded size="small" severity="danger"
        class="node-delete" :data-testid="`delete-${node.type}-${node.name}`"
        @click="handleDelete(node, $event)" />
    </div>

    <div class="new-btns">
      <Button icon="pi pi-plus" label="New page" text size="small"
        data-testid="new-page" @click="showCreatePage = true" />
      <Button icon="pi pi-plus" label="New fragment" text size="small"
        data-testid="new-fragment" @click="showCreateFragment = true" />
    </div>
    <CreatePageDialog v-if="showCreatePage" :visible="showCreatePage"
      @close="showCreatePage = false" />
    <CreateFragmentDialog v-if="showCreateFragment" :visible="showCreateFragment"
      @close="showCreateFragment = false" />
  </div>
</template>

<style scoped>
.site-tree { font-size: 13px; line-height: 22px; }
.section-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; padding: 4px 8px; font-weight: 600; }
.section-divider { border-top: 1px solid rgba(128, 128, 128, 0.15); margin: 4px 8px; }
.node-item { display: flex; align-items: center; gap: 4px; height: 22px; padding: 0 6px; margin: 0 2px; cursor: pointer; border-radius: 3px; }
.node-item:hover { background: rgba(128, 128, 128, 0.08); }
.node-item.selected { background: rgba(167, 139, 250, 0.15); box-shadow: inset 2px 0 0 #a78bfa; }
.node-icon { width: 16px; text-align: center; font-size: 10px; color: #999; flex-shrink: 0; }
.node-label { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #6b7280; }
.node-item.selected .node-label { color: #374151; }
.node-item:hover .node-label { color: #374151; }
:global(.dark) .section-label { color: #666; }
:global(.dark) .section-divider { border-top-color: #27272a; }
:global(.dark) .node-item:hover { background: rgba(255, 255, 255, 0.05); }
:global(.dark) .node-icon { color: #666; }
:global(.dark) .node-label { color: #bbb; }
:global(.dark) .node-item.selected .node-label { color: #e4e4e7; }
:global(.dark) .node-item:hover .node-label { color: #e4e4e7; }
.node-delete { opacity: 0; transition: opacity 0.1s; flex-shrink: 0; }
.node-item:hover .node-delete { opacity: 1; }
.new-btns { display: flex; gap: 0.5rem; margin-top: 8px; padding: 0 6px; }
</style>
