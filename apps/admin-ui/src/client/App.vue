<script setup lang="ts">
import { onMounted } from 'vue'
import { useSiteStore } from './stores/site.js'
import { useSelectionStore } from './stores/selection.js'
import { useThemeStore } from './stores/theme.js'
import { useToastStore } from './stores/toast.js'
import Toolbar from './components/CmsToolbar.vue'

const site = useSiteStore()
const selection = useSelectionStore()
const theme = useThemeStore()
const toast = useToastStore()
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

    <!-- Global toast — visible over everything including fullscreen -->
    <Transition name="toast">
      <div v-if="toast.current" class="global-toast" :class="toast.current.type === 'error' ? 'toast-error' : 'toast-success'">
        <i :class="toast.current.type === 'error' ? 'pi pi-exclamation-circle' : 'pi pi-check-circle'" />
        <a v-if="toast.current.link" :href="toast.current.link" target="_blank" rel="noopener" class="toast-link">{{ toast.current.message }}</a>
        <template v-else>{{ toast.current.message }}</template>
      </div>
    </Transition>
  </div>
</template>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #app, .cms-app { height: 100%; }
body { font-family: system-ui, -apple-system, sans-serif; color: #1a1a1a; background: #fff; }
.dark body { color: #e4e4e7; background: #09090b; }
.cms-error { padding: 2rem; color: #c00; }
.cms-loading { padding: 2rem; color: #666; }
.global-toast { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 1001; background: #18181b; border: 1px solid #27272a; border-radius: 8px; padding: 8px 16px; font-size: 0.8125rem; display: flex; align-items: center; gap: 0.375rem; box-shadow: 0 4px 12px rgba(0,0,0,0.4); }
.toast-success { color: #16a34a; }
.toast-error { color: #dc2626; }
.toast-link { color: inherit; text-decoration: underline; }
.toast-enter-active, .toast-leave-active { transition: opacity 0.2s, transform 0.2s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(-8px); }
</style>
