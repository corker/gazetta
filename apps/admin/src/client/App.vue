<script setup lang="ts">
import { onMounted } from 'vue'
import { useSiteStore } from './stores/site.js'
import { useThemeStore } from './stores/theme.js'
import { useToastStore } from './stores/toast.js'
import Toolbar from './components/CmsToolbar.vue'
import UnsavedDialog from './components/UnsavedDialog.vue'

const site = useSiteStore()
const theme = useThemeStore()
const toast = useToastStore()
onMounted(() => {
  theme.init()
})
</script>

<template>
  <div class="cms-app">
    <Toolbar />
    <div v-if="site.error" class="cms-error">{{ site.error }}</div>
    <div v-else-if="site.loading" class="cms-loading">Loading site...</div>
    <router-view v-else />

    <UnsavedDialog />

    <!-- Global toast — visible over everything including fullscreen -->
    <Transition name="toast">
      <div v-if="toast.current" class="global-toast" :class="toast.current.type === 'error' ? 'toast-error' : 'toast-success'" data-testid="global-toast">
        <i :class="toast.current.type === 'error' ? 'pi pi-exclamation-circle' : 'pi pi-check-circle'" />
        <a v-if="toast.current.link" :href="toast.current.link" target="_blank" rel="noopener" class="toast-link">{{ toast.current.message }}</a>
        <template v-else>{{ toast.current.message }}</template>
        <button v-if="toast.current.type === 'error'" type="button" class="toast-dismiss" data-testid="toast-dismiss"
          aria-label="Dismiss" @click="toast.dismiss()">
          <i class="pi pi-times" />
        </button>
      </div>
    </Transition>
  </div>
</template>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #app, .cms-app { height: 100%; }
body { font-family: system-ui, -apple-system, sans-serif; color: var(--color-fg); background: var(--color-bg); }
.cms-error { padding: 2rem; color: var(--color-danger-fg); }
.cms-loading { padding: 2rem; color: var(--color-muted); }
.global-toast { position: fixed; top: 0; left: 50%; transform: translateX(-50%); z-index: 1001; background: var(--color-bg); color: var(--color-fg); border: 1px solid var(--color-border); border-top: none; border-radius: 0 0 8px 8px; padding: 8px 20px; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); max-width: 400px; }
.toast-success { color: var(--color-success-fg); }
.toast-error { color: var(--color-danger-fg); }
.toast-link { color: inherit; text-decoration: underline; }
.toast-dismiss { background: transparent; border: 0; color: inherit; cursor: pointer; padding: 2px 4px; margin-left: 4px; opacity: 0.7; display: flex; align-items: center; }
.toast-dismiss:hover { opacity: 1; }
.toast-dismiss .pi { font-size: 11px; }
.toast-enter-active { transition: transform 200ms ease-out, opacity 200ms ease-out; }
.toast-leave-active { transition: transform 150ms ease-in, opacity 150ms ease-in; }
.toast-enter-from { opacity: 0; transform: translateX(-50%) translateY(-100%); }
.toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(-100%); }
</style>
