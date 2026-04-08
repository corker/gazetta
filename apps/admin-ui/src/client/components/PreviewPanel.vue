<script setup lang="ts">
import { ref, watch, computed, inject, onMounted, onUnmounted } from 'vue'
import morphdom from 'morphdom'
import { useSelectionStore } from '../stores/selection.js'
import { useEditingStore } from '../stores/editing.js'
import { usePreviewStore } from '../stores/preview.js'
import { useToastStore } from '../stores/toast.js'
import { useSiteStore } from '../stores/site.js'

const selection = useSelectionStore()
const editing = useEditingStore()
const preview = usePreviewStore()
const toast = useToastStore()
const site = useSiteStore()
const iframeRef = ref<HTMLIFrameElement | null>(null)
const loading = ref(false)
let currentHtml = ''
let debounceTimer: ReturnType<typeof setTimeout> | null = null

const selectByGzId = inject<(gzId: string) => void>('selectByGzId')

const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
const previewPath = computed(() => {
  if (!selection.previewRoute) return null
  return `${basePath}/preview${selection.previewRoute}`
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

// Edit mode — controlled by toolbar toggle, disabled in fullscreen
const editMode = ref(true)

// Send edit mode state to iframe bridge
function sendEditMode() {
  iframeRef.value?.contentWindow?.postMessage({ type: 'gazetta:editMode', enabled: editMode.value }, '*')
}
watch(editMode, sendEditMode)

// Bridge script — parent controls edit mode via postMessage
const BRIDGE_SCRIPT = `
<script>
(function() {
  var overlay = document.createElement('div');
  overlay.id = 'gz-overlay';
  overlay.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #a78bfa;border-radius:4px;z-index:99999;transition:border-color 0.15s;display:none;';
  document.body.appendChild(overlay);
  var highlighted = null;
  var enabled = true;

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
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
  }

  function refreshOverlay() {
    if (highlighted && highlighted.isConnected) showOverlay(highlighted, overlay.style.borderColor);
    else { highlighted = null; overlay.style.display = 'none'; }
  }

  window.addEventListener('scroll', refreshOverlay, true);
  window.addEventListener('resize', refreshOverlay);

  document.addEventListener('mousemove', function(e) {
    if (!enabled) { if (highlighted) { highlighted = null; overlay.style.display = 'none'; } return; }
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
    var link = e.target.closest ? e.target.closest('a[href]') : null;
    if (link) {
      var href = link.getAttribute('href');
      if (href) {
        e.preventDefault();
        e.stopPropagation();
        if (href.startsWith('/') || href.startsWith(location.origin)) {
          var path = href.startsWith('/') ? href : new URL(href).pathname;
          window.parent.postMessage({ type: 'gazetta:navigate', route: path }, '*');
        } else {
          window.parent.postMessage({ type: 'gazetta:external', url: href }, '*');
        }
        return;
      }
    }
    if (!enabled) return;
    var target = findGz(e.target);
    if (target) {
      e.preventDefault();
      e.stopPropagation();
      showOverlay(target, '#22c55e');
      window.parent.postMessage({ type: 'gazetta:select', gzId: target.dataset.gz }, '*');
    }
  }, true);

  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'gazetta:editMode') {
      enabled = !!e.data.enabled;
      if (!enabled) { highlighted = null; overlay.style.display = 'none'; document.body.style.cursor = ''; }
      else { document.body.style.cursor = 'crosshair'; }
    }
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
  if (e.data?.type === 'gazetta:navigate' && e.data.route) {
    const page = site.pages.find(p => p.route === e.data.route)
    if (page) {
      editing.clear()
      selection.selectPage(page.name)
    } else {
      toast.show(`No page found for route ${e.data.route}`, { type: 'error' })
    }
  }
  if (e.data?.type === 'gazetta:external' && e.data.url) {
    toast.show(e.data.url, { link: e.data.url, duration: 5000 })
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
    const hasDraft = editing.dirty && editing.path && editing.content
    let res: Response
    if (hasDraft) {
      const overrides: Record<string, Record<string, unknown>> = {}
      overrides[editing.path!] = editing.content!
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
    // Send initial edit mode state after iframe loads
    setTimeout(sendEditMode, 100)
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
      onBeforeNodeDiscarded(node) {
        if ((node as Element).id === 'gz-overlay') return false
        return true
      },
      onBeforeElUpdated(fromEl, toEl) {
        if (fromEl.id === 'gz-overlay') return false
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
watch(() => editing.path, (path) => {
  if (!path || !iframeRef.value?.contentWindow) return
  // TODO: compute gzId from the component's treePath and send to iframe
})

watch(() => preview.version, () => fetchPreview(true))
watch(previewPath, () => fetchPreview(false), { immediate: true })
watch(() => preview.draftVersion, debouncedFetchPreview)

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
        <div class="preview-actions">
          <button
            :class="['device-btn', { active: editMode }]"
            :title="editMode ? 'Edit mode (click to preview)' : 'Preview mode (click to edit)'"
            @click="editMode = !editMode">
            <i :class="editMode ? 'pi pi-pencil' : 'pi pi-eye'" />
          </button>
          <button class="device-btn" :title="fullscreen ? 'Exit fullscreen' : 'Fullscreen'"
            @click="toggleFullscreen">
            <i :class="fullscreen ? 'pi pi-window-minimize' : 'pi pi-window-maximize'" />
          </button>
        </div>
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
.preview-actions { display: flex; gap: 0.25rem; }
.device-btn { background: none; border: 1px solid transparent; border-radius: 4px; padding: 0.25rem 0.5rem; color: #71717a; cursor: pointer; font-size: 0.875rem; }
.device-btn:hover { color: #e4e4e7; border-color: #3f3f46; }
.device-btn.active { color: #a78bfa; border-color: #a78bfa; }
.preview-frame-wrapper { flex: 1; display: flex; justify-content: center; overflow: auto; background: #1a1a2e; }
.preview-iframe { flex: none; height: 100%; border: 0; background: #fff; transition: width 0.2s; }
</style>
