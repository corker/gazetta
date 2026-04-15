<script setup lang="ts">
/**
 * Active target indicator — read-only display of the current active target.
 *
 * Shows the target name with environment-based chrome (neutral for local,
 * amber for staging, red for production). Read-only variant matches the
 * design's "transient" chrome intensity — the dropdown switcher (R31)
 * becomes the permanent/committed variant.
 *
 * Hides when no targets loaded or only one target exists (progressive
 * disclosure: nothing to indicate when there's only one place for content).
 */
import { computed } from 'vue'
import { useActiveTargetStore } from '../stores/activeTarget.js'

const activeTarget = useActiveTargetStore()

const visible = computed(() => activeTarget.targets.length > 1 && activeTarget.activeTarget !== null)

const environmentClass = computed(() => {
  const env = activeTarget.activeTarget?.environment
  if (env === 'production') return 'env-production'
  if (env === 'staging') return 'env-staging'
  return 'env-local'
})

const editableLabel = computed(() => activeTarget.isActiveEditable ? 'editable' : 'read-only')
</script>

<template>
  <span v-if="visible" class="active-target" :class="environmentClass"
    data-testid="active-target-indicator"
    :title="`Active target: ${activeTarget.activeTargetName} (${editableLabel})`">
    <span class="dot" aria-hidden="true" />
    <span class="name">{{ activeTarget.activeTargetName }}</span>
    <span v-if="!activeTarget.isActiveEditable" class="readonly-badge">read-only</span>
  </span>
</template>

<style scoped>
.active-target {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  border-radius: var(--p-border-radius-sm);
  font-size: 0.8125rem;
  font-weight: 500;
  background: var(--color-hover-bg);
  color: var(--color-fg);
  border: 1px solid var(--color-border);
}
.dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.6;
}
.name {
  letter-spacing: -0.01em;
}
.readonly-badge {
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.65;
  padding-left: 0.375rem;
  border-left: 1px solid currentColor;
  margin-left: 0.125rem;
}

/* Environment chrome — scales with "permanence": the indicator is a
   subtle-to-moderate treatment. The switcher (R31) will go fuller when
   prod is the editable active target. */
.env-production {
  background: var(--color-env-prod-bg);
  color: var(--color-env-prod-fg);
  border-color: var(--color-env-prod-fg);
}
.env-staging {
  background: var(--color-env-staging-bg);
  color: var(--color-env-staging-fg);
  border-color: var(--color-env-staging-fg);
}
/* env-local inherits the neutral treatment from the base style */
</style>
