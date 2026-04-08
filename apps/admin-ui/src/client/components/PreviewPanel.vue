<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import morphdom from 'morphdom'
import { useEditorStore } from '../stores/editor.js'

const editor = useEditorStore()
const iframeRef = ref<HTMLIFrameElement | null>(null)
const loading = ref(false)
let currentHtml = ''
let debounceTimer: ReturnType<typeof setTimeout> | null = null

const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
const previewPath = computed(() => {
  if (!editor.previewRoute) return null
  return `${basePath}/preview${editor.previewRoute}`
})

// Full-screen toggle
const fullscreen = ref(false)

// Device presets
const devicePresets = [
  { label: 'Desktop', width: '100%', icon: 'pi pi-desktop' },
  { label: 'Tablet', width: '768px', icon: 'pi pi-tablet' },
  { label: 'Mobile', width: '375px', icon: 'pi pi-mobile' },
]
const activePreset = ref(0)
const previewWidth = computed(() => devicePresets[activePreset.value].width)

async function fetchPreview(morph = true) {
  if (!previewPath.value) { currentHtml = ''; return }
  loading.value = true
  try {
    const hasDraft = editor.dirty && editor.selectedComponentPath && editor.componentContent
    let res: Response
    if (hasDraft) {
      const overrides: Record<string, Record<string, unknown>> = {}
      overrides[editor.selectedComponentPath!] = editor.componentContent!
      res = await fetch(previewPath.value, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides }),
      })
    } else {
      res = await fetch(previewPath.value)
    }
    const html = await res.text()
    applyHtml(html, morph)
  } catch {
    applyHtml('<pre style="color:red;padding:2rem">Failed to load preview</pre>', false)
  } finally {
    loading.value = false
  }
}

function applyHtml(html: string, morph: boolean) {
  const iframe = iframeRef.value
  if (!iframe) return

  if (!morph || !currentHtml || !iframe.contentDocument?.body?.innerHTML) {
    // First load or error — full replace
    iframe.srcdoc = html
    currentHtml = html
    return
  }

  // Morph the body — preserves scroll, focus, no flash
  try {
    const doc = iframe.contentDocument
    if (!doc) { iframe.srcdoc = html; currentHtml = html; return }

    // Parse new HTML to extract body and head
    const parser = new DOMParser()
    const newDoc = parser.parseFromString(html, 'text/html')

    // Morph the body
    morphdom(doc.body, newDoc.body, {
      onBeforeElUpdated(fromEl, toEl) {
        // Don't update if elements are the same (skip unchanged subtrees)
        if (fromEl.isEqualNode(toEl)) return false
        return true
      },
    })

    // Update style tags in head (CSS might have changed)
    const oldStyles = doc.head.querySelectorAll('style')
    const newStyles = newDoc.head.querySelectorAll('style')
    oldStyles.forEach((s, i) => {
      if (newStyles[i] && s.textContent !== newStyles[i].textContent) {
        s.textContent = newStyles[i].textContent
      }
    })

    currentHtml = html
  } catch {
    // Fallback to full replace
    iframe.srcdoc = html
    currentHtml = html
  }
}

function debouncedFetchPreview() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => fetchPreview(true), 300)
}

// Refresh on page selection or after save (full fetch, morph)
watch(() => editor.previewVersion, () => fetchPreview(true))
watch(previewPath, () => fetchPreview(false), { immediate: true })

// Live refresh on draft edits (debounced, morph)
watch(() => editor.draftVersion, debouncedFetchPreview)

function toggleFullscreen() {
  fullscreen.value = !fullscreen.value
}
</script>

<template>
  <div class="preview-panel" :class="{ fullscreen }" data-testid="preview-panel">
    <div v-if="!previewPath" class="preview-empty" data-testid="preview-empty">
      <i class="pi pi-eye" style="font-size: 2rem; color: #ddd; margin-bottom: 0.5rem;" />
      <p>Select a page to preview</p>
    </div>
    <template v-else>
      <div class="preview-toolbar">
        <div class="preview-devices">
          <button v-for="(preset, i) in devicePresets" :key="preset.label"
            :class="['device-btn', { active: activePreset === i }]"
            :title="preset.label"
            @click="activePreset = i">
            <i :class="preset.icon" />
          </button>
        </div>
        <button class="device-btn" :title="fullscreen ? 'Exit fullscreen' : 'Fullscreen'"
          @click="toggleFullscreen">
          <i :class="fullscreen ? 'pi pi-window-minimize' : 'pi pi-window-maximize'" />
        </button>
      </div>
      <div class="preview-frame-wrapper">
        <iframe ref="iframeRef" class="preview-iframe" data-testid="preview-iframe"
          :style="{ width: previewWidth, maxWidth: '100%' }" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.preview-panel { height: 100%; display: flex; flex-direction: column; }
.preview-panel.fullscreen {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  z-index: 1000; background: #09090b;
}
.preview-empty { padding: 1rem; color: #aaa; font-size: 0.875rem; display: flex; flex-direction: column; align-items: center; padding-top: 3rem; }
.preview-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 0.375rem 0.5rem; border-bottom: 1px solid #27272a; }
.preview-devices { display: flex; gap: 0.25rem; }
.device-btn { background: none; border: 1px solid transparent; border-radius: 4px; padding: 0.25rem 0.5rem; color: #71717a; cursor: pointer; font-size: 0.875rem; }
.device-btn:hover { color: #e4e4e7; border-color: #3f3f46; }
.device-btn.active { color: #a78bfa; border-color: #a78bfa; }
.preview-frame-wrapper { flex: 1; display: flex; justify-content: center; overflow: auto; background: #1a1a2e; }
.preview-iframe { flex: none; height: 100%; border: 0; background: #fff; transition: width 0.2s; }
</style>
