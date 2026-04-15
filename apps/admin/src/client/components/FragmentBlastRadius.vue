<script setup lang="ts">
/**
 * "Used on N pages" badge for fragments — surfaces blast radius inline
 * while the author is editing a fragment, not only inside the publish
 * dialog. Matches design-editor-ux.md gap: "Fragment blast radius in tree
 * and editor header — currently only in PublishDialog."
 *
 * Fetches source-side dependents (authoritative for the draft state).
 * Quiet while loading, hidden on error — we'd rather show nothing than
 * a confusing "?" in the editor header.
 */
import { ref, watch, onMounted } from 'vue'
import { api } from '../api/client.js'

const props = defineProps<{
  /** Fragment name (not including the leading @). */
  fragmentName: string
  /** Compact mode — icon + count only, no "used on N pages" label.
   *  For dense lists (tree rows) where full text would wrap or clutter. */
  compact?: boolean
}>()

const pages = ref<string[] | null>(null)
const loading = ref(false)

async function load(name: string) {
  loading.value = true
  try {
    const r = await api.getDependents(`fragments/${name}`)
    pages.value = r.pages
  } catch {
    pages.value = null
  } finally {
    loading.value = false
  }
}

onMounted(() => load(props.fragmentName))
watch(() => props.fragmentName, (name) => load(name))

const summary = (pages: string[]) => pages.length === 1 ? 'used on 1 page' : `used on ${pages.length} pages`
</script>

<template>
  <span v-if="pages" :class="['blast-radius', { compact }]" data-testid="fragment-blast-radius"
    :title="pages.length > 0 ? `Used on: ${pages.join(', ')}` : 'Not used on any page yet'">
    <i class="pi pi-sitemap" aria-hidden="true" />
    <template v-if="compact">
      <span class="count">{{ pages.length }}</span>
    </template>
    <template v-else>
      <span v-if="pages.length > 0">{{ summary(pages) }}</span>
      <span v-else class="unused">not used yet</span>
    </template>
  </span>
</template>

<style scoped>
.blast-radius {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.125rem 0.5rem;
  border-radius: var(--p-border-radius-sm);
  font-size: 0.75rem;
  color: var(--color-muted);
  background: var(--color-hover-bg);
  border: 1px solid var(--color-border);
  letter-spacing: -0.01em;
}
.blast-radius .pi {
  font-size: 0.625rem;
  opacity: 0.7;
}
.blast-radius .unused {
  font-style: italic;
  opacity: 0.75;
}
.blast-radius.compact {
  padding: 0 0.25rem;
  border: 0;
  background: transparent;
  font-variant-numeric: tabular-nums;
  font-size: 0.6875rem;
}
.blast-radius.compact .count {
  font-weight: 600;
}
</style>
