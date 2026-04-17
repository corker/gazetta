<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useSelectionStore } from '../stores/selection.js'
import { useSiteStore } from '../stores/site.js'
import { useToastStore } from '../stores/toast.js'
import { usePagesApi } from '../composables/api.js'
import type { PageMetadata } from '../api/client.js'

const selection = useSelectionStore()
const site = useSiteStore()
const toast = useToastStore()
const pagesApi = usePagesApi()

const title = ref('')
const description = ref('')
const ogImage = ref('')
const canonical = ref('')
const noindex = ref(false)
const saving = ref(false)
const dirty = ref(false)

const TITLE_MAX = 60
const DESC_MAX = 160

function load(meta: PageMetadata | undefined) {
  title.value = meta?.title ?? ''
  description.value = meta?.description ?? ''
  ogImage.value = meta?.ogImage ?? ''
  canonical.value = meta?.canonical ?? ''
  noindex.value = meta?.robots?.includes('noindex') ?? false
  dirty.value = false
}

watch(
  () => selection.detail,
  d => {
    if (d && 'metadata' in d) load(d.metadata as PageMetadata | undefined)
    else load(undefined)
  },
  { immediate: true },
)

function markDirty() {
  dirty.value = true
}

async function save() {
  if (!selection.name || selection.type !== 'page') return
  saving.value = true
  try {
    const metadata: PageMetadata = {}
    if (title.value) metadata.title = title.value
    if (description.value) metadata.description = description.value
    if (ogImage.value) metadata.ogImage = ogImage.value
    if (canonical.value) metadata.canonical = canonical.value
    if (noindex.value) metadata.robots = 'noindex'
    await pagesApi.updatePage(selection.name, { metadata })
    dirty.value = false
    await selection.reload()
    toast.show('Metadata saved')
  } catch (err) {
    toast.showError(err, 'Failed to save metadata')
  } finally {
    saving.value = false
  }
}

function charClass(current: number, max: number): string {
  const ratio = current / max
  if (ratio >= 1) return 'over'
  if (ratio >= 0.9) return 'warn'
  return 'ok'
}

const pageDetail = computed(() =>
  selection.type === 'page' ? (selection.detail as import('../api/client.js').PageDetail | null) : null,
)
const siteName = computed(() => site.manifest?.name)

// SERP preview uses the same fallback chain as the renderer (seo.ts):
//   metadata field → content field + site name → omit
const serpTitle = computed(() => {
  if (title.value) return title.value
  const contentTitle = pageDetail.value?.content?.title as string | undefined
  if (contentTitle) return siteName.value ? `${contentTitle} — ${siteName.value}` : contentTitle
  return selection.name || ''
})
// SERP URL shows the route structure. The actual canonical URL is
// resolved at publish time from the target's siteUrl — the admin
// doesn't know which target will be published to, so we show a
// placeholder domain.
const serpUrl = computed(() => canonical.value || `https://example.com${pageDetail.value?.route ?? '/'}`)
const serpDescription = computed(() => description.value || (pageDetail.value?.content?.description as string) || '')
</script>

<template>
  <div class="metadata-editor" data-testid="metadata-editor">
    <div class="meta-header">
      <h3>SEO Metadata</h3>
      <button v-if="dirty" class="meta-save-btn" :disabled="saving" @click="save" data-testid="metadata-save">
        {{ saving ? 'Saving…' : 'Save metadata' }}
      </button>
    </div>

    <div class="meta-fields">
      <div class="field">
        <label for="meta-title">Title</label>
        <input id="meta-title" v-model="title" @input="markDirty" placeholder="Page title for search engines"
          data-testid="meta-title" />
        <span :class="['char-count', charClass(title.length, TITLE_MAX)]">{{ title.length }}/{{ TITLE_MAX }}</span>
      </div>

      <div class="field">
        <label for="meta-description">Description</label>
        <textarea id="meta-description" v-model="description" @input="markDirty"
          placeholder="Brief description for search results" rows="2"
          data-testid="meta-description" />
        <span :class="['char-count', charClass(description.length, DESC_MAX)]">{{ description.length }}/{{ DESC_MAX }}</span>
      </div>

      <div class="field">
        <label for="meta-og-image">OG Image URL</label>
        <input id="meta-og-image" v-model="ogImage" @input="markDirty" placeholder="https://example.com/image.jpg"
          data-testid="meta-og-image" />
      </div>

      <div class="field">
        <label for="meta-canonical">Canonical URL</label>
        <input id="meta-canonical" v-model="canonical" @input="markDirty" placeholder="https://example.com/page"
          data-testid="meta-canonical" />
      </div>

      <div class="field field-checkbox">
        <label class="checkbox-label">
          <input type="checkbox" v-model="noindex" @change="markDirty" data-testid="meta-noindex" />
          <span>Hide from search engines</span>
        </label>
        <span class="checkbox-hint">Adds <code>noindex</code> robots directive. Page won't appear in sitemap.</span>
      </div>
    </div>

    <!-- SERP preview — always light-themed to match Google's appearance -->
    <div :class="['serp-preview', { 'serp-noindex': noindex }]" data-testid="serp-preview">
      <div v-if="noindex" class="serp-noindex-badge">
        <i class="pi pi-eye-slash" aria-hidden="true" /> noindex — hidden from search engines
      </div>
      <div class="serp-card">
        <div class="serp-url">{{ serpUrl }}</div>
        <div class="serp-title">{{ serpTitle.slice(0, 70) }}{{ serpTitle.length > 70 ? '…' : '' }}</div>
        <div class="serp-desc">{{ serpDescription.slice(0, 170) }}{{ serpDescription.length > 170 ? '…' : '' }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.metadata-editor {
  border-top: 1px solid var(--color-border);
  padding-top: 1rem;
  margin-top: 1rem;
}
.meta-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}
.meta-header h3 {
  font-size: 0.75rem;
  text-transform: uppercase;
  color: var(--color-muted);
  letter-spacing: 0.05em;
  margin: 0;
}
.meta-save-btn {
  font-size: 0.75rem;
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--p-primary-color);
  border-radius: var(--p-border-radius-sm);
  background: var(--p-primary-color);
  color: #fff;
  cursor: pointer;
  font-family: inherit;
}
.meta-save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.meta-fields { display: flex; flex-direction: column; gap: 0.625rem; }
.field { display: flex; flex-direction: column; gap: 0.25rem; position: relative; }
.field label {
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-muted);
  font-weight: 500;
}
.field input, .field textarea {
  font-size: 0.8125rem;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--color-input-border);
  border-radius: var(--p-border-radius-sm);
  background: var(--color-input-bg);
  color: var(--color-fg);
  font-family: inherit;
  resize: vertical;
}
.field input:focus, .field textarea:focus {
  outline: 2px solid var(--p-primary-color);
  outline-offset: -1px;
}
.char-count {
  font-size: 0.625rem;
  align-self: flex-end;
  font-variant-numeric: tabular-nums;
}
.char-count.ok { color: var(--color-muted); }
.char-count.warn { color: var(--color-warning-fg); }
.char-count.over { color: var(--color-danger-fg); font-weight: 600; }

.field-checkbox { flex-direction: row; align-items: flex-start; gap: 0.375rem; }
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  color: var(--color-fg);
  cursor: pointer;
}
.checkbox-label input[type="checkbox"] { cursor: pointer; }
.checkbox-hint {
  font-size: 0.6875rem;
  color: var(--color-muted);
  margin-left: 1.25rem;
}
.checkbox-hint code {
  font-size: 0.625rem;
  padding: 0.0625rem 0.25rem;
  background: var(--color-hover-bg);
  border-radius: 2px;
}

/* SERP preview — always light-themed regardless of admin dark/light mode */
.serp-preview {
  margin-top: 1rem;
  padding: 0.75rem;
  background: #fff;
  border: 1px solid #dadce0;
  border-radius: 8px;
}
.serp-card { font-family: Arial, sans-serif; }
.serp-url {
  font-size: 0.75rem;
  color: #202124;
  margin-bottom: 0.125rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.serp-title {
  font-size: 1.125rem;
  color: #1a0dab;
  line-height: 1.3;
  margin-bottom: 0.25rem;
  cursor: pointer;
}
.serp-title:hover { text-decoration: underline; }
.serp-desc {
  font-size: 0.8125rem;
  color: #4d5156;
  line-height: 1.4;
}
.serp-noindex .serp-card { opacity: 0.4; }
.serp-noindex-badge {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.6875rem;
  color: #b91c1c;
  font-weight: 500;
  margin-bottom: 0.5rem;
}
</style>
