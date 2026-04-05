<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Tree from 'primevue/tree'
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

watch(detail, async (d) => {
  if (!d || !d.components) { componentNodes.value = []; return }
  componentNodes.value = await Promise.all(
    d.components.map(async (name: string) => {
      const isFragment = name.startsWith('@')
      const label = isFragment ? name : name
      const path = isFragment ? undefined : `${d.dir}/${name}`
      let template = ''
      if (path) {
        try {
          const comp = await api.getComponent(path)
          template = (comp.template as string) ?? ''
        } catch { /* component may not have manifest */ }
      }
      return {
        key: name,
        label,
        icon: isFragment ? 'pi pi-share-alt' : 'pi pi-box',
        data: { path, template, isFragment },
      } as TreeNode
    })
  )
}, { immediate: true })

function onSelect(node: TreeNode) {
  if (!node.data?.path || !node.data?.template) return
  editor.selectComponent(node.data.path, node.data.template)
}
</script>

<template>
  <div v-if="detail" class="component-tree">
    <h3>{{ title }}</h3>
    <p class="component-template">Template: {{ detail.template }}</p>
    <Tree v-if="componentNodes.length" :value="componentNodes" v-model:selectionKeys="selectedKey"
      selectionMode="single" @node-select="onSelect" class="tree" />
    <p v-else class="empty">No components</p>
  </div>
</template>

<style scoped>
.component-tree { margin-top: 1.5rem; }
.component-tree h3 { font-size: 0.75rem; text-transform: uppercase; color: #888; margin-bottom: 0.5rem; letter-spacing: 0.05em; }
.component-template { font-size: 0.75rem; color: #aaa; margin-bottom: 0.5rem; }
.tree { font-size: 0.875rem; }
.empty { font-size: 0.875rem; color: #aaa; }
</style>
