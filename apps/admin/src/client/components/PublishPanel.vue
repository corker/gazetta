<script setup lang="ts">
/**
 * Unified Publish panel — the design-editor-ux.md surface that replaces
 * PublishDialog + FetchDialog + ChangesDrawer.
 *
 * Shape:
 *   - Source: where content is coming from (defaults to active target when
 *     editable, else first editable). Dropdown so the author can publish
 *     from staging → prod ("promote") without leaving the panel.
 *   - Destinations: multi-select across non-source targets. Mirrors the
 *     design's "fan-out" publish model.
 *   - Items: list of changed items (R38b), each with diff expansion.
 *   - Action: "Publish N → M" button runs the publish stream (R38c).
 *
 * This commit (R38a) lands the shell: source picker, destinations
 * checkboxes, empty item list placeholder, disabled action. R38b adds
 * the item list + diffs; R38c wires streaming publish; R38d deletes the
 * old dialogs.
 */

import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Select from 'primevue/select'
import { useActiveTargetStore } from '../stores/activeTarget.js'
import { useSyncStatusStore } from '../stores/syncStatus.js'
import PublishItemList from './PublishItemList.vue'

const props = defineProps<{
  visible: boolean
  /** Optional initial destination pre-check (e.g., click sync chip → open panel). */
  initialDestination?: string
}>()
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>()

const activeTarget = useActiveTargetStore()
const syncStatus = useSyncStatusStore()

// --- Source selection -------------------------------------------------

const editableTargets = computed(() => activeTarget.editableTargets)

/** Default source: the active target when editable, else the first editable. */
function pickDefaultSource(): string | null {
  const active = activeTarget.activeTarget
  if (active?.editable) return active.name
  return editableTargets.value[0]?.name ?? null
}

const sourceName = ref<string | null>(null)

// Destinations: anything that isn't the source
const destinationOptions = computed(() =>
  activeTarget.targets.filter(t => t.name !== sourceName.value)
)

const selectedDestinations = ref<Set<string>>(new Set())

function toggleDestination(name: string) {
  const next = new Set(selectedDestinations.value)
  if (next.has(name)) next.delete(name); else next.add(name)
  selectedDestinations.value = next
}

// Items selected for publish. Managed via v-model:selected on the list;
// list auto-populates when source/destinations change.
const selectedItems = ref<Set<string>>(new Set())

// Destination names as an array (PublishItemList takes string[]).
const destinationNames = computed(() => [...selectedDestinations.value])

// --- Panel lifecycle --------------------------------------------------

watch(() => props.visible, (v) => {
  if (!v) {
    // Clear selection on close so stale state doesn't leak between
    // invocations (e.g., different source next time).
    selectedItems.value = new Set()
    return
  }
  sourceName.value = pickDefaultSource()
  const preselect = new Set<string>()
  if (props.initialDestination && destinationOptions.value.some(t => t.name === props.initialDestination)) {
    preselect.add(props.initialDestination)
  }
  selectedDestinations.value = preselect
  selectedItems.value = new Set()
  // Kick off sync-status refresh so the destination list shows accurate
  // change counts. syncStatus caches per-target; this is cheap on reopen.
  if (activeTarget.targets.length > 1) syncStatus.refreshAll()
})

// When the source changes, any previously-selected destinations that
// happen to now BE the source get dropped automatically.
watch(sourceName, (name) => {
  if (!name) return
  if (selectedDestinations.value.has(name)) {
    const next = new Set(selectedDestinations.value)
    next.delete(name)
    selectedDestinations.value = next
  }
})

function close() { emit('update:visible', false) }

// --- Action (stubbed in R38a; wired in R38c) -------------------------

const canPublish = computed(() =>
  !!sourceName.value
    && selectedDestinations.value.size > 0
    && selectedItems.value.size > 0
)

const publishLabel = computed(() => {
  const items = selectedItems.value.size
  const dests = selectedDestinations.value.size
  if (items === 0 || dests === 0) return 'Publish'
  return `Publish ${items} ${items === 1 ? 'item' : 'items'} → ${dests} ${dests === 1 ? 'target' : 'targets'}`
})

const publishTitle = computed(() => {
  if (!sourceName.value) return 'Pick a source'
  if (selectedDestinations.value.size === 0) return 'Pick at least one destination'
  if (selectedItems.value.size === 0) return 'Pick at least one item'
  return ''
})

function statusLabel(name: string): string {
  if (syncStatus.isLoading(name)) return '…'
  const err = syncStatus.errorFor(name)
  if (err) return '?'
  const s = syncStatus.get(name)
  if (!s) return ''
  if (s.firstPublish) return 'not yet published'
  if (s.changedCount === 0) return 'in sync'
  return `${s.changedCount} behind`
}

function envClass(env: string | undefined): string {
  if (env === 'production') return 'env-production'
  if (env === 'staging') return 'env-staging'
  return 'env-local'
}
</script>

<template>
  <Dialog :visible="props.visible" @update:visible="v => emit('update:visible', v)"
    modal dismissableMask :closable="true" header="Publish"
    :style="{ width: '760px', maxWidth: '95vw' }"
    data-testid="publish-panel">
    <div class="publish-panel">
      <!-- Source picker -->
      <div class="row">
        <label class="row-label">From</label>
        <Select
          v-if="editableTargets.length > 1"
          :modelValue="sourceName"
          @update:modelValue="(v: string) => sourceName = v"
          :options="editableTargets"
          optionLabel="name"
          optionValue="name"
          placeholder="Select source"
          data-testid="publish-source-select"
          class="row-control"
        />
        <div v-else class="row-value" data-testid="publish-source-fixed">
          <span :class="['chip', envClass(editableTargets[0]?.environment)]">
            {{ sourceName ?? '(no editable target)' }}
          </span>
        </div>
      </div>

      <!-- Destinations -->
      <div class="row">
        <label class="row-label">To</label>
        <div v-if="destinationOptions.length === 0" class="row-value muted">
          (no other targets configured)
        </div>
        <div v-else class="destinations" data-testid="publish-destinations">
          <label
            v-for="t in destinationOptions"
            :key="t.name"
            :class="['destination', envClass(t.environment)]"
            :data-testid="`publish-dest-${t.name}`">
            <Checkbox
              :modelValue="selectedDestinations.has(t.name)"
              @update:modelValue="() => toggleDestination(t.name)"
              :inputId="`dest-${t.name}`"
              :binary="true"
            />
            <span class="dest-name">{{ t.name }}</span>
            <span v-if="!t.editable" class="dest-badge">read-only</span>
            <span class="dest-status">{{ statusLabel(t.name) }}</span>
          </label>
        </div>
      </div>

      <!-- Items -->
      <div class="row row-items">
        <label class="row-label">Items</label>
        <PublishItemList
          :source="sourceName"
          :destinations="destinationNames"
          :selected="selectedItems"
          @update:selected="(v: Set<string>) => selectedItems = v"
        />
      </div>
    </div>

    <template #footer>
      <Button label="Cancel" severity="secondary" @click="close"
        data-testid="publish-panel-cancel" />
      <Button
        :label="publishLabel"
        severity="success"
        :disabled="!canPublish"
        data-testid="publish-panel-confirm"
        :title="publishTitle"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.publish-panel {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding-top: 0.5rem;
}
.row {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
}
.row-items {
  flex-direction: column;
  align-items: stretch;
  gap: 0.5rem;
}
.row-items .row-label {
  padding-top: 0;
}
.row-label {
  flex: 0 0 5rem;
  padding-top: 0.375rem;
  color: var(--color-muted);
  font-size: 0.8125rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.row-control {
  flex: 1;
  min-width: 0;
}
.row-value {
  flex: 1;
  min-width: 0;
  padding-top: 0.375rem;
}
.row-value.muted {
  color: var(--color-muted);
  font-size: 0.8125rem;
  font-style: italic;
}

.chip {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.625rem;
  border-radius: var(--p-border-radius-sm);
  font-size: 0.8125rem;
  font-weight: 500;
  background: var(--color-hover-bg);
  border: 1px solid var(--color-border);
}
.chip.env-production {
  background: var(--color-env-prod-bg);
  color: var(--color-env-prod-fg);
  border-color: var(--color-env-prod-fg);
}
.chip.env-staging {
  background: var(--color-env-staging-bg);
  color: var(--color-env-staging-fg);
  border-color: var(--color-env-staging-fg);
}

.destinations {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.destination {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.75rem;
  border-radius: var(--p-border-radius-sm);
  border: 1px solid var(--color-border);
  cursor: pointer;
  font-size: 0.875rem;
}
.destination:hover {
  background: var(--color-hover-bg);
}
.dest-name {
  font-weight: 500;
}
.dest-badge {
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.65;
  padding: 0.125rem 0.375rem;
  border: 1px solid currentColor;
  border-radius: var(--p-border-radius-xs);
}
.dest-status {
  font-size: 0.75rem;
  color: var(--color-muted);
  font-variant-numeric: tabular-nums;
}

.destination.env-production {
  border-left: 3px solid var(--color-env-prod-fg);
}
.destination.env-staging {
  border-left: 3px solid var(--color-env-staging-fg);
}
</style>
