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
.global-toast { position: fixed; top: 0; left: 50%; transform: translateX(-50%); z-index: 1001; background: #000; border: 1px solid hsl(0, 0%, 20%); border-top: none; border-radius: 0 0 8px 8px; padding: 10px 16px; font-size: 13px; color: hsl(0, 0%, 99%); display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); max-width: 356px; }
.toast-success { color: hsl(150, 86%, 65%); }
.toast-error { color: hsl(358, 100%, 81%); }
.toast-link { color: inherit; text-decoration: underline; }
.toast-enter-active { transition: opacity 0.3s ease, transform 0.3s ease, max-height 0.3s ease; }
.toast-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.toast-enter-from { opacity: 0; transform: translateX(-50%) translateY(-100%); }
.toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(-50%); }
</style>
