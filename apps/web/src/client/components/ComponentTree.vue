<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Tree from 'primevue/tree'
import Button from 'primevue/button'
import type { TreeNode } from 'primevue/treenode'
import { useEditorStore } from '../stores/editor.js'
import { api } from '../api/client.js'

const editor = useEditorStore()
const selectedKey = ref<Record<string, boolean>>({})
const componentNodes = ref<TreeNode[]>([])

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
        data: { isFragment: true, fragName, index },
        children,
      }
    } catch {
      return { key: `frag:${fragName}:${index}`, label: name, icon: 'pi pi-share-alt', data: { isFragment: true, index } }
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
    data: { path, template, isFragment: false, index },
    children,
  }
}

watch(detail, async (d) => {
  if (!d || !d.components) { componentNodes.value = []; return }
  componentNodes.value = await Promise.all(
    d.components.map((name: string, i: number) => buildComponentNode(name, d.dir, i))
  )
}, { immediate: true })

function onSelect(node: TreeNode) {
  if (!node.data || node.data.isFragment || !node.data.path || !node.data.template) return
  editor.selectComponent(node.data.path, node.data.template)
}
</script>

<template>
  <div v-if="detail" class="component-tree">
    <h3>{{ title }}</h3>
    <p class="component-template">Template: {{ detail.template }}</p>

    <div v-if="componentNodes.length" class="component-list">
      <div v-for="(node, index) in componentNodes" :key="node.key" class="component-item">
        <Tree :value="[node]" v-model:selectionKeys="selectedKey"
          selectionMode="single" @node-select="onSelect" class="tree" />
        <div class="component-actions">
          <Button icon="pi pi-arrow-up" text rounded size="small"
            :disabled="index === 0" @click="editor.moveComponent(index, -1)" />
          <Button icon="pi pi-arrow-down" text rounded size="small"
            :disabled="index === componentCount - 1" @click="editor.moveComponent(index, 1)" />
          <Button icon="pi pi-trash" text rounded size="small" severity="danger"
            @click="editor.removeComponent(index)" />
        </div>
      </div>
    </div>
    <p v-else class="empty">No components</p>
  </div>
</template>

<style scoped>
.component-tree { margin-top: 1.5rem; }
.component-tree h3 { font-size: 0.75rem; text-transform: uppercase; color: #888; margin-bottom: 0.5rem; letter-spacing: 0.05em; }
.component-template { font-size: 0.75rem; color: #aaa; margin-bottom: 0.5rem; }
.component-list { display: flex; flex-direction: column; gap: 0.125rem; }
.component-item { display: flex; align-items: flex-start; gap: 0.25rem; }
.component-item .tree { flex: 1; }
.component-actions { display: flex; flex-direction: column; padding-top: 0.25rem; }
.tree { font-size: 0.875rem; }
.empty { font-size: 0.875rem; color: #aaa; }
</style>
