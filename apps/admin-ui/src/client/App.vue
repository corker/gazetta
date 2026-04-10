<script setup lang="ts">
import { onMounted } from 'vue'
import { useSiteStore } from './stores/site.js'
import { useSelectionStore } from './stores/selection.js'
import { useThemeStore } from './stores/theme.js'
import Toolbar from './components/CmsToolbar.vue'

const site = useSiteStore()
const selection = useSelectionStore()
const theme = useThemeStore()
onMounted(async () => {
  await site.load()
  theme.init()
  selection.restore()
})
</script>

<template>
  <div class="cms-app">
    <Toolbar />
    <div v-if="site.error" class="cms-error">{{ site.error }}</div>
    <div v-else-if="site.loading" class="cms-loading">Loading site...</div>
    <router-view v-else />
  </div>
</template>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #app, .cms-app { height: 100%; }
body { font-family: system-ui, -apple-system, sans-serif; color: #1a1a1a; background: #fff; }
.dark body { color: #e4e4e7; background: #09090b; }
.cms-error { padding: 2rem; color: #c00; }
.cms-loading { padding: 2rem; color: #666; }
</style>
