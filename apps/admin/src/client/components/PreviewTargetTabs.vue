<script setup lang="ts">
/**
 * Per-page target tabs above the preview pane.
 *
 * Intent — distinct from the top-bar switcher:
 *   - Top-bar switcher = global workspace action ("switch my focus")
 *   - Preview tabs    = page-context comparison ("show this page on X
 *                       target" — rapid A/B flipping while authoring)
 *
 * Both ultimately call activeTarget.setActiveTarget. The separation is
 * purely affordance placement — the design calls for comparison to feel
 * like flipping tabs, not navigating a menu.
 *
 * Progressive disclosure: hidden when only one target exists. No point
 * showing tabs with a single option.
 */
import { computed } from 'vue'
import { useActiveTargetStore } from '../stores/activeTarget.js'
import type { TargetInfo } from '../api/client.js'

const activeTarget = useActiveTargetStore()

const visible = computed(() => activeTarget.targets.length > 1)

function environmentClass(t: TargetInfo): string {
  if (t.environment === 'production') return 'env-production'
  if (t.environment === 'staging') return 'env-staging'
  return 'env-local'
}

function onTabClick(t: TargetInfo) {
  if (t.name !== activeTarget.activeTargetName) {
    activeTarget.setActiveTarget(t.name)
  }
}
</script>

<template>
  <div v-if="visible" class="preview-target-tabs" role="tablist" data-testid="preview-target-tabs">
    <button
      v-for="t in activeTarget.targets"
      :key="t.name"
      type="button"
      role="tab"
      :class="['preview-target-tab', environmentClass(t), { active: t.name === activeTarget.activeTargetName }]"
      :aria-selected="t.name === activeTarget.activeTargetName"
      :data-testid="`preview-target-tab-${t.name}`"
      :title="`View this page on ${t.name}${t.editable ? '' : ' (read-only)'}`"
      @click="onTabClick(t)">
      <span class="dot" aria-hidden="true" />
      <span class="name">{{ t.name }}</span>
      <i v-if="!t.editable" class="pi pi-lock lock" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.preview-target-tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg);
}
.preview-target-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  border: 1px solid transparent;
  border-radius: var(--p-border-radius-sm);
  background: transparent;
  color: var(--color-muted);
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 500;
  font-family: inherit;
}
.preview-target-tab:hover {
  color: var(--color-fg);
  background: var(--color-hover-bg);
}
.preview-target-tab:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}
.preview-target-tab.active {
  color: var(--color-fg);
  background: var(--color-hover-bg);
  border-color: var(--color-border);
}

.dot {
  width: 0.4375rem;
  height: 0.4375rem;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.6;
}
.lock {
  font-size: 0.625rem;
  opacity: 0.6;
}

/* Environment chrome — transient (tab peek) vs permanent (top-bar
   selector) split from the design. Tabs get the subtle version. */
.preview-target-tab.active.env-production {
  background: var(--color-env-prod-bg);
  color: var(--color-env-prod-fg);
  border-color: var(--color-env-prod-fg);
}
.preview-target-tab.active.env-staging {
  background: var(--color-env-staging-bg);
  color: var(--color-env-staging-fg);
  border-color: var(--color-env-staging-fg);
}
</style>
