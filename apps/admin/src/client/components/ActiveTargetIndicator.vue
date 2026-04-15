<script setup lang="ts">
/**
 * Active target indicator + switcher.
 *
 * Shows the active target's name with environment-based chrome. When 2+
 * targets exist, clicking the pill opens a menu to switch. With only one
 * target or none, the pill hides entirely (progressive disclosure).
 *
 * Environment chrome:
 *   env-local:      neutral
 *   env-staging:    amber
 *   env-production: red
 *
 * Editable vs read-only shows as a sub-badge on the pill.
 */
import { computed, ref } from 'vue'
import Menu from 'primevue/menu'
import { useActiveTargetStore } from '../stores/activeTarget.js'
import { useEditingStore } from '../stores/editing.js'
import { useUnsavedGuardStore } from '../stores/unsavedGuard.js'
import type { TargetInfo } from '../api/client.js'

const activeTarget = useActiveTargetStore()
const editing = useEditingStore()
const unsavedGuard = useUnsavedGuardStore()
const menu = ref<InstanceType<typeof Menu> | null>(null)

const visible = computed(() => activeTarget.targets.length > 0 && activeTarget.activeTarget !== null)
const interactive = computed(() => activeTarget.targets.length > 1)

const environmentClass = computed(() => {
  const env = activeTarget.activeTarget?.environment
  if (env === 'production') return 'env-production'
  if (env === 'staging') return 'env-staging'
  return 'env-local'
})

const editableLabel = computed(() => activeTarget.isActiveEditable ? 'editable' : 'read-only')

const menuItems = computed(() => activeTarget.targets.map((t: TargetInfo) => ({
  label: t.name,
  icon: iconFor(t),
  class: t.name === activeTarget.activeTargetName ? 'active' : '',
  command: () => switchTo(t.name),
})))

/**
 * Switch active target with an unsaved-changes guard — same pattern as
 * the router's route-leave hook. Without this, switching to another
 * target while the editor has pending edits would either silently drop
 * them (clear on switch) or save them against the new target (the save
 * closure resolves `?target=<active>` at call time). Forcing a Save /
 * Don't Save / Cancel decision keeps the author in control.
 */
async function switchTo(name: string) {
  if (name === activeTarget.activeTargetName) return
  if (editing.hasPendingEdits) {
    const result = await unsavedGuard.guard()
    if (result === 'cancel') return
    if (result === 'save') await editing.save()
    editing.clear()
  }
  activeTarget.setActiveTarget(name)
}

function iconFor(t: TargetInfo): string {
  if (t.name === activeTarget.activeTargetName) return 'pi pi-check'
  if (!t.editable) return 'pi pi-lock'
  return 'pi pi-circle'
}

function onClick(event: Event) {
  if (interactive.value) menu.value?.toggle(event)
}
</script>

<template>
  <template v-if="visible">
    <button type="button"
      class="active-target"
      :class="[environmentClass, { interactive }]"
      data-testid="active-target-indicator"
      :title="`Active target: ${activeTarget.activeTargetName} (${editableLabel})${interactive ? ' — click to switch' : ''}`"
      :aria-haspopup="interactive ? 'menu' : undefined"
      :disabled="!interactive"
      @click="onClick">
      <span class="dot" aria-hidden="true" />
      <span class="name">{{ activeTarget.activeTargetName }}</span>
      <span v-if="!activeTarget.isActiveEditable" class="readonly-badge">read-only</span>
      <i v-if="interactive" class="pi pi-chevron-down chevron" aria-hidden="true" />
    </button>
    <Menu v-if="interactive" ref="menu" :model="menuItems" :popup="true"
      data-testid="active-target-menu" />
  </template>
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
  cursor: default;
  font-family: inherit;
}
.active-target.interactive {
  cursor: pointer;
}
.active-target.interactive:hover {
  filter: brightness(0.96);
}
.active-target.interactive:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
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
.chevron {
  font-size: 0.625rem;
  opacity: 0.6;
  margin-left: 0.125rem;
}

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
</style>

<style>
/* Highlight the active target in the switcher menu. Non-scoped so PrimeVue's
   generated class hash doesn't block the selector. */
.p-menu .p-menuitem.active > .p-menuitem-content {
  font-weight: 600;
}
.p-menu .p-menuitem.active .p-menuitem-icon {
  color: var(--p-primary-color);
}
</style>
