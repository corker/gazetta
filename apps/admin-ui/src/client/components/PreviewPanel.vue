<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import morphdom from 'morphdom'
import { useSelectionStore } from '../stores/selection.js'
import { useEditingStore } from '../stores/editing.js'
import { usePreviewStore } from '../stores/preview.js'
import { useToastStore } from '../stores/toast.js'
import { useSiteStore } from '../stores/site.js'
import { useUiModeStore } from '../stores/uiMode.js'
import { useComponentFocusStore } from '../stores/componentFocus.js'

/** FNV-1a hash — same function as in packages/gazetta/src/scope.ts */
function hashPath(path: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < path.length; i++) {
    hash ^= path.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

const selection = useSelectionStore()
const editing = useEditingStore()
const preview = usePreviewStore()
const toast = useToastStore()
const site = useSiteStore()
const uiMode = useUiModeStore()
const iframeRef = ref<HTMLIFrameElement | null>(null)
const loading = ref(false)
let currentHtml = ''
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let previewHoverTimer: ReturnType<typeof setTimeout> | null = null

const focus = useComponentFocusStore()

// Send hover highlight to bridge
function sendHighlight() {
  iframeRef.value?.contentWindow?.postMessage({ type: 'gazetta:highlight', gzId: focus.highlightGzId ?? null }, '*')
}
watch(() => focus.highlightGzId, sendHighlight)

// Send selection to bridge — green overlay
function sendSelection() {
  iframeRef.value?.contentWindow?.postMessage({ type: 'gazetta:showSelect', gzId: focus.selectedGzId ?? null }, '*')
}
watch(() => focus.selectedGzId, sendSelection)

const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
const previewPath = computed(() => {
  if (!selection.previewRoute) return null
  return `${basePath}/preview${selection.previewRoute}`
})

// Fragment scope — gzId of the fragment root for dimming
const fragmentScopeGzId = computed(() => {
  if (selection.type !== 'fragment' || !selection.name || !selection.fragmentHostPage) return null
  return hashPath(`@${selection.name}`)
})

// Device presets
const devicePresets = [
  { label: 'Desktop', width: '100%', icon: 'pi pi-desktop' },
  { label: 'Tablet', width: '768px', icon: 'pi pi-tablet' },
  { label: 'Mobile', width: '375px', icon: 'pi pi-mobile' },
]
const activePreset = ref(0)
const previewWidth = computed(() => devicePresets[activePreset.value].width)

// Highlight toggle — only meaningful in edit mode
const highlightEnabled = ref(true)

// Send bridge mode + highlight state to iframe
function sendBridgeMode() {
  iframeRef.value?.contentWindow?.postMessage({
    type: 'gazetta:mode',
    mode: uiMode.bridgeMode,
    highlight: highlightEnabled.value,
  }, '*')
}
watch(() => uiMode.bridgeMode, sendBridgeMode)
watch(highlightEnabled, sendBridgeMode)

// Send fragment scope to bridge for dimming
function sendScope() {
  iframeRef.value?.contentWindow?.postMessage({
    type: 'gazetta:scope',
    gzId: fragmentScopeGzId.value,
  }, '*')
}
watch(fragmentScopeGzId, sendScope)

// Bridge script — three-mode behavior controlled by parent via postMessage
const BRIDGE_SCRIPT = `
<script>
(function() {
  // Hover overlay — transient, subtle, fades
  var hoverOvl = document.createElement('div');
  hoverOvl.id = 'gz-hover';
  hoverOvl.style.cssText = 'position:fixed;pointer-events:none;border:1px solid rgba(167,139,250,0.5);border-radius:4px;z-index:100000;transition:opacity 0.2s;display:none;opacity:0;';
  document.body.appendChild(hoverOvl);

  // Selection overlay — persistent, solid green
  var selectOvl = document.createElement('div');
  selectOvl.id = 'gz-select';
  selectOvl.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #22c55e;border-radius:4px;z-index:99999;display:none;';
  document.body.appendChild(selectOvl);

  // Dim overlay — fragment scope backdrop
  var dimOverlay = document.createElement('div');
  dimOverlay.id = 'gz-dim';
  dimOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.3);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);z-index:99998;pointer-events:none;display:none;transition:opacity 0.2s;opacity:0;';
  document.body.appendChild(dimOverlay);

  var hoveredEl = null;
  var selectedEl = null;
  var mode = 'browse';
  var highlight = true;
  var scopedEl = null;
  var scopedOrigPos = '';

  function findGz(el) {
    while (el && el !== document.body) {
      if (el.dataset && el.dataset.gz) return el;
      el = el.parentElement;
    }
    return null;
  }

  function isInteractive(el) {
    var tag = el.tagName;
    return tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'LABEL' || el.isContentEditable;
  }

  function positionOverlay(ovl, el) {
    var rect = el.getBoundingClientRect();
    ovl.style.display = 'block';
    ovl.style.top = rect.top + 'px';
    ovl.style.left = rect.left + 'px';
    ovl.style.width = rect.width + 'px';
    ovl.style.height = rect.height + 'px';
  }

  function refreshOverlays() {
    if (hoveredEl && hoveredEl.isConnected) positionOverlay(hoverOvl, hoveredEl);
    else { hoveredEl = null; hoverOvl.style.display = 'none'; }
    if (selectedEl && selectedEl.isConnected) positionOverlay(selectOvl, selectedEl);
    else { selectedEl = null; selectOvl.style.display = 'none'; }
  }

  function showSelect(el) {
    selectedEl = el;
    positionOverlay(selectOvl, el);
  }

  function clearSelect() {
    selectedEl = null;
    selectOvl.style.display = 'none';
  }

  function showHover(el) {
    hoveredEl = el;
    positionOverlay(hoverOvl, el);
    hoverOvl.style.opacity = '1';
  }

  function clearHover() {
    hoverOvl.style.opacity = '0';
    setTimeout(function() { if (!hoveredEl) hoverOvl.style.display = 'none'; }, 200);
    hoveredEl = null;
  }

  function scrollIfOffscreen(el) {
    var rect = el.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function applyScope(gzId) {
    if (scopedEl) {
      scopedEl.style.position = scopedOrigPos;
      scopedEl.style.zIndex = '';
      scopedEl.style.cursor = '';
      scopedEl = null;
    }
    dimOverlay.style.opacity = '0';
    setTimeout(function() { if (!scopedEl) dimOverlay.style.display = 'none'; }, 200);

    if (!gzId) {
      if (mode === 'edit' && highlight) document.body.style.cursor = 'crosshair';
      return;
    }
    var el = document.querySelector('[data-gz="' + gzId + '"]');
    if (!el) return;

    scopedOrigPos = el.style.position;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.style.zIndex = '99999';
    scopedEl = el;
    if (mode === 'edit' && highlight) {
      document.body.style.cursor = '';
      el.style.cursor = 'crosshair';
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    dimOverlay.style.display = 'block';
    dimOverlay.offsetHeight;
    dimOverlay.style.opacity = '1';
  }

  window.addEventListener('scroll', refreshOverlays, true);
  window.addEventListener('resize', refreshOverlays);

  function isInScope(el) {
    return !scopedEl || scopedEl.contains(el);
  }

  // Clear hover when mouse leaves the iframe
  document.addEventListener('mouseleave', function() {
    if (hoveredEl) { clearHover(); window.parent.postMessage({ type: 'gazetta:hover', gzId: null }, '*'); }
  });

  // Edit mode: mousemove hover highlight in preview
  document.addEventListener('mousemove', function(e) {
    if (mode !== 'edit' || !highlight) {
      if (hoveredEl) { clearHover(); window.parent.postMessage({ type: 'gazetta:hover', gzId: null }, '*'); }
      return;
    }
    var target = findGz(e.target);
    if (target && target !== hoveredEl && isInScope(target)) {
      showHover(target);
      window.parent.postMessage({ type: 'gazetta:hover', gzId: target.dataset.gz }, '*');
    } else if (!target || !isInScope(target)) {
      if (hoveredEl) { clearHover(); window.parent.postMessage({ type: 'gazetta:hover', gzId: null }, '*'); }
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

    if (mode === 'fullscreen') return;
    if (isInteractive(e.target)) return;

    var target = findGz(e.target);
    if (!target || !isInScope(target)) return;

    e.preventDefault();
    e.stopPropagation();

    window.parent.postMessage({ type: 'gazetta:select', gzId: target.dataset.gz }, '*');
  }, true);

  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'gazetta:mode') {
      mode = e.data.mode || 'browse';
      highlight = e.data.highlight !== false;
      if (hoveredEl) clearHover();
      var cursorTarget = scopedEl || document.body;
      document.body.style.cursor = '';
      if (scopedEl) scopedEl.style.cursor = '';
      cursorTarget.style.cursor = (mode === 'edit' && highlight) ? 'crosshair' : '';
    }
    if (e.data && e.data.type === 'gazetta:highlight') {
      if (e.data.gzId) {
        var el = document.querySelector('[data-gz="' + e.data.gzId + '"]');
        if (el) { showHover(el); scrollIfOffscreen(el); }
      } else {
        clearHover();
        if (selectedEl) scrollIfOffscreen(selectedEl);
        else window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
    if (e.data && e.data.type === 'gazetta:showSelect') {
      if (e.data.gzId) {
        var sel = document.querySelector('[data-gz="' + e.data.gzId + '"]');
        if (sel) showSelect(sel);
        else clearSelect();
      } else {
        clearSelect();
      }
    }
    if (e.data && e.data.type === 'gazetta:scrollTo') {
      if (e.data.gzId) {
        var scrollEl = document.querySelector('[data-gz="' + e.data.gzId + '"]');
        if (scrollEl) scrollIfOffscreen(scrollEl);
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
    if (e.data && e.data.type === 'gazetta:scope') {
      applyScope(e.data.gzId);
    }
  });
})();
<\/script>
`

function injectBridge(html: string): string {
  // Strip dev server reload script (parent handles SSE) and inject bridge
  return html
    .replace(/<script>new EventSource\([^)]+\)[^<]*<\/script>/g, '')
    .replace('</body>', `${BRIDGE_SCRIPT}\n</body>`)
}

function handleMessage(e: MessageEvent) {
  if (e.data?.type === 'gazetta:select' && e.data.gzId) {
    // Instant visual feedback — show selection overlay before async processing
    iframeRef.value?.contentWindow?.postMessage({ type: 'gazetta:showSelect', gzId: e.data.gzId }, '*')
    // In browse mode, entering edit first — setPending buffers for ComponentTree
    if (uiMode.mode === 'browse') uiMode.enterEdit()
    focus.setPending(e.data.gzId)
    // Move focus from iframe to parent so keyboard shortcuts (Escape) work
    iframeRef.value?.blur()
  }
  if (e.data?.type === 'gazetta:navigate' && e.data.route) {
    const page = site.pages.find(p => p.route === e.data.route)
    if (page) {
      if (editing.dirty && !confirm('You have unsaved changes. Discard?')) return
      editing.clear()
      selection.selectPage(page.name)
    } else {
      toast.show(`No page found for route ${e.data.route}`, { type: 'error' })
    }
  }
  if (e.data?.type === 'gazetta:hover') {
    focus.previewHover(e.data.gzId ?? null)
    // When preview hover ends, scroll back to selected component after delay
    if (previewHoverTimer) { clearTimeout(previewHoverTimer); previewHoverTimer = null }
    if (!e.data.gzId) {
      previewHoverTimer = setTimeout(() => {
        iframeRef.value?.contentWindow?.postMessage({ type: 'gazetta:scrollTo', gzId: focus.selectedGzId ?? null }, '*')
        previewHoverTimer = null
      }, 300)
    }
  }
  if (e.data?.type === 'gazetta:external' && e.data.url) {
    toast.show(e.data.url, { link: e.data.url, duration: 5000 })
  }
}

// SSE hot reload — listen for template/manifest changes from dev server
let sse: EventSource | null = null

onMounted(() => {
  window.addEventListener('message', handleMessage)
  // Connect to dev server reload stream (ignored in production — endpoint won't exist)
  try {
    sse = new EventSource('/__reload')
    sse.onmessage = () => fetchPreview(true)
    sse.onerror = () => { sse?.close(); sse = null }
  } catch { /* SSE not available */ }
})

onUnmounted(() => {
  window.removeEventListener('message', handleMessage)
  sse?.close()
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
    // Send initial bridge mode + scope after iframe loads
    setTimeout(() => { sendBridgeMode(); sendScope() }, 100)
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
        const id = (node as Element).id; if (id === 'gz-hover' || id === 'gz-select' || id === 'gz-dim') return false
        return true
      },
      onBeforeElUpdated(fromEl, toEl) {
        if (fromEl.id === 'gz-hover' || fromEl.id === 'gz-select' || fromEl.id === 'gz-dim') return false
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


watch(() => preview.version, () => fetchPreview(true))
watch(previewPath, () => fetchPreview(false), { immediate: true })
watch(() => preview.draftVersion, debouncedFetchPreview)
</script>

<template>
  <div class="preview-panel" :class="{ fullscreen: uiMode.fullscreen }" data-testid="preview-panel">
    <div v-if="!previewPath" class="preview-empty" data-testid="preview-empty">
      <i class="pi pi-eye" style="font-size: 2rem; color: #ddd; margin-bottom: 0.5rem;" />
      <p>Select a page or fragment to preview</p>
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
          <!-- Host page selector for fragment preview -->
          <select v-if="selection.type === 'fragment' && selection.staticPages.length > 1"
            class="host-page-select"
            data-testid="host-page-select"
            :value="selection.fragmentHostPage?.name ?? ''"
            @change="selection.setFragmentHostPage(($event.target as HTMLSelectElement).value)">
            <option v-for="page in selection.staticPages" :key="page.name" :value="page.name">
              {{ page.name }}
            </option>
          </select>
          <button v-if="uiMode.mode === 'edit'"
            :class="['device-btn', { active: highlightEnabled }]"
            :title="highlightEnabled ? 'Hide highlights' : 'Show highlights'"
            data-testid="highlight-toggle"
            @click="highlightEnabled = !highlightEnabled">
            <i class="pi pi-eye" />
          </button>
          <button class="device-btn"
            :title="uiMode.fullscreen ? 'Exit fullscreen' : 'Fullscreen'"
            data-testid="fullscreen-toggle"
            @click="uiMode.toggleFullscreen()">
            <i :class="uiMode.fullscreen ? 'pi pi-window-minimize' : 'pi pi-window-maximize'" />
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
.preview-actions { display: flex; gap: 0.25rem; align-items: center; }
.device-btn { background: none; border: 1px solid transparent; border-radius: 4px; padding: 0.25rem 0.5rem; color: #71717a; cursor: pointer; font-size: 0.875rem; }
.device-btn:hover { color: #e4e4e7; border-color: #3f3f46; }
.device-btn.active { color: #a78bfa; border-color: #a78bfa; }
.host-page-select { background: #1e1e2e; color: #e0e0e0; border: 1px solid #3f3f46; border-radius: 4px; padding: 0.2rem 0.4rem; font-size: 0.75rem; cursor: pointer; }
.preview-frame-wrapper { flex: 1; display: flex; justify-content: center; overflow: auto; background: #1a1a2e; }
.preview-iframe { flex: none; height: 100%; border: 0; background: #fff; transition: width 0.2s; }
</style>
