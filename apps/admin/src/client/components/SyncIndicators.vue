<script setup lang="ts">
/**
 * Compact sync status chips for non-active targets.
 *
 * One chip per non-active target, showing "name · N behind" or "name · in sync".
 * Environment chrome matches the ActiveTargetIndicator so the top bar reads
 * as a single row of related pills.
 *
 * Progressive disclosure: hidden entirely when there are no non-active
 * targets to report on. Each chip is a read-only summary — clicking it
 * (wired later) will jump to the changes drawer or publish panel.
 */
import { computed } from 'vue'
import { useSyncStatusStore } from '../stores/syncStatus.js'
import type { TargetInfo } from '../api/client.js'

const sync = useSyncStatusStore()

const emit = defineEmits<{ (e: 'select', name: string): void }>()

function environmentClass(t: TargetInfo): string {
  if (t.environment === 'production') return 'env-production'
  if (t.environment === 'staging') return 'env-staging'
  return 'env-local'
}

function statusLabel(t: TargetInfo): string {
  if (sync.isLoading(t.name)) return '…'
  const err = sync.errorFor(t.name)
  if (err) return '?'
  const status = sync.get(t.name)
  if (!status) return '—'
  if (status.firstPublish) return 'not yet published'
  if (status.changedCount === 0) return 'in sync'
  return `${status.changedCount} behind`
}

function statusClass(t: TargetInfo): string {
  if (sync.isLoading(t.name)) return 'state-loading'
  if (sync.errorFor(t.name)) return 'state-error'
  const status = sync.get(t.name)
  if (!status) return 'state-unknown'
  if (status.firstPublish) return 'state-unpublished'
  if (status.changedCount === 0) return 'state-synced'
  return 'state-behind'
}

const chips = computed(() => sync.nonActiveTargets)
</script>

<template>
  <div v-if="chips.length > 0" class="sync-indicators" data-testid="sync-indicators">
    <button
      v-for="t in chips"
      :key="t.name"
      type="button"
      class="sync-chip"
      :class="[environmentClass(t), statusClass(t)]"
      :data-testid="`sync-chip-${t.name}`"
      :title="`${t.name}: ${statusLabel(t)} — click to see changes`"
      @click="emit('select', t.name)">
      <span class="dot" aria-hidden="true" />
      <span class="name">{{ t.name }}</span>
      <span class="sep" aria-hidden="true">·</span>
      <span class="status">{{ statusLabel(t) }}</span>
    </button>
  </div>
</template>

<style scoped>
.sync-indicators {
  display: inline-flex;
  gap: 0.25rem;
  align-items: center;
  margin-left: 0.5rem;
}
.sync-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.125rem 0.5rem;
  border-radius: var(--p-border-radius-sm);
  font-size: 0.75rem;
  color: var(--color-muted);
  border: 1px solid var(--color-border);
  background: transparent;
  letter-spacing: -0.01em;
  cursor: pointer;
  font-family: inherit;
}
.sync-chip:hover {
  background: var(--color-hover-bg);
}
.sync-chip:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}
.dot {
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.55;
}
.name {
  font-weight: 500;
}
.sep {
  opacity: 0.4;
}
.status {
  opacity: 0.85;
}

/* State modifiers — give the status word a hint of its own color so the
   scanning author can spot "behind" without reading. */
.sync-chip.state-synced { color: var(--color-success-fg); }
.sync-chip.state-behind { color: var(--color-fg); border-color: var(--color-fg); opacity: 0.9; }
.sync-chip.state-unpublished { color: var(--color-muted); }
.sync-chip.state-error { color: var(--color-danger-fg); }
.sync-chip.state-loading { opacity: 0.55; }

/* Environment tints — only on the border/dot to stay compact. The active
   target (in ActiveTargetIndicator) gets the full color fill. */
.sync-chip.env-production { border-color: var(--color-env-prod-fg); }
.sync-chip.env-production .dot { color: var(--color-env-prod-fg); }
.sync-chip.env-staging { border-color: var(--color-env-staging-fg); }
.sync-chip.env-staging .dot { color: var(--color-env-staging-fg); }
</style>
