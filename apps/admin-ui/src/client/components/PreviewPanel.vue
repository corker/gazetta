<script setup lang="ts">
import { ref, watch, computed, inject, onMounted, onUnmounted } from 'vue'
import morphdom from 'morphdom'
import { useEditorStore } from '../stores/editor.js'

const editor = useEditorStore()
const iframeRef = ref<HTMLIFrameElement | null>(null)
const loading = ref(false)
let currentHtml = ''
let debounceTimer: ReturnType<typeof setTimeout> | null = null

const selectByGzId = inject<(gzId: string) => void>('selectByGzId')

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

// Bridge script — hover highlights, click selects component
const BRIDGE_SCRIPT = `
<script>
(function() {
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;pointer-events:none;border:2px solid #a78bfa;border-radius:4px;z-index:99999;transition:all 0.15s;display:none;';
  document.body.appendChild(overlay);
  var highlighted = null;

  function findGz(el) {
    while (el && el !== document.body) {
      if (el.dataset && el.dataset.gz) return el;
      el = el.parentElement;
    }
    return null;
  }

  function showOverlay(el, color) {
    var rect = el.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.borderColor = color || '#a78bfa';
    overlay.style.top = (rect.top + window.scrollY) + 'px';
    overlay.style.left = (rect.left + window.scrollX) + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
  }

  document.addEventListener('mousemove', function(e) {
    var target = findGz(e.target);
    if (target && target !== highlighted) {
      highlighted = target;
      showOverlay(target, '#a78bfa');
    } else if (!target) {
      highlighted = null;
      overlay.style.display = 'none';
    }
  });

  document.addEventListener('click', function(e) {
    var target = findGz(e.target);
    if (target) {
      e.preventDefault();
      e.stopPropagation();
      showOverlay(target, '#22c55e');
      window.parent.postMessage({ type: 'gazetta:select', gzId: target.dataset.gz }, '*');
    }
  }, true);

  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'gazetta:highlight') {
      var el = document.querySelector('[data-gz="' + e.data.gzId + '"]');
      if (el) { highlighted = el; showOverlay(el, '#22c55e'); }
    }
  });
})();
<\/script>
`

function injectBridge(html: string): string {
  return html.replace('</body>', `${BRIDGE_SCRIPT}\n</body>`)
}

function handleMessage(e: MessageEvent) {
  if (e.data?.type === 'gazetta:select' && e.data.gzId && selectByGzId) {
    selectByGzId(e.data.gzId)
  }
}

onMounted(() => {
  window.addEventListener('message', handleMessage)
})

onUnmounted(() => {
  window.removeEventListener('message', handleMessage)
})

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
    const html = injectBridge(await res.text())
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
    iframe.srcdoc = html
    currentHtml = html
    return
  }

  try {
    const doc = iframe.contentDocument
    if (!doc) { iframe.srcdoc = html; currentHtml = html; return }

    const parser = new DOMParser()
    const newDoc = parser.parseFromString(html, 'text/html')

    morphdom(doc.body, newDoc.body, {
      onBeforeElUpdated(fromEl, toEl) {
        if (fromEl.isEqualNode(toEl)) return false
        return true
      },
    })

    const oldStyles = doc.head.querySelectorAll('style')
    const newStyles = newDoc.head.querySelectorAll('style')
    oldStyles.forEach((s, i) => {
      if (newStyles[i] && s.textContent !== newStyles[i].textContent) {
        s.textContent = newStyles[i].textContent
      }
    })

    currentHtml = html
  } catch {
    iframe.srcdoc = html
    currentHtml = html
  }
}

function debouncedFetchPreview() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => fetchPreview(true), 300)
}

// Highlight selected component in preview
watch(() => editor.selectedComponentPath, (path) => {
  if (!path || !iframeRef.value?.contentWindow) return
  // TODO: compute gzId from the component's treePath and send to iframe
})

watch(() => editor.previewVersion, () => fetchPreview(true))
watch(previewPath, () => fetchPreview(false), { immediate: true })
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
