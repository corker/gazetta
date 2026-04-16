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
import { api, type PublishResult } from '../api/client.js'
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

/**
 * Destinations grouped by environment. Groups with 2+ members render a
 * "select all" header checkbox that toggles every member at once —
 * design-editor-ux.md "Multi-destination publish (fan-out)": selecting
 * an environment group selects all its members. Single-member groups
 * render flat (no header) so the UI stays quiet for simple setups.
 *
 * Iteration order is preserved from the target declaration order in
 * site.yaml, which matches the top-bar switcher and sync indicators.
 */
interface DestinationGroup {
  environment: string
  members: typeof destinationOptions.value
}
const destinationGroups = computed<DestinationGroup[]>(() => {
  const groups = new Map<string, DestinationGroup>()
  for (const t of destinationOptions.value) {
    const env = t.environment ?? 'local'
    let g = groups.get(env)
    if (!g) { g = { environment: env, members: [] }; groups.set(env, g) }
    g.members.push(t)
  }
  return [...groups.values()]
})

/** Tri-state of a group's selection: 'none' | 'some' | 'all'. */
function groupState(group: DestinationGroup): 'none' | 'some' | 'all' {
  const selected = group.members.filter(m => selectedDestinations.value.has(m.name)).length
  if (selected === 0) return 'none'
  if (selected === group.members.length) return 'all'
  return 'some'
}

/** Toggle an entire group: if any member is unselected, select all; else deselect all. */
function toggleGroup(group: DestinationGroup) {
  const next = new Set(selectedDestinations.value)
  const state = groupState(group)
  if (state === 'all') {
    for (const m of group.members) next.delete(m.name)
  } else {
    for (const m of group.members) next.add(m.name)
  }
  selectedDestinations.value = next
}

// Items selected for publish. Managed via v-model:selected on the list;
// list auto-populates when source/destinations change.
const selectedItems = ref<Set<string>>(new Set())

// Destination names as an array (PublishItemList takes string[]).
const destinationNames = computed(() => [...selectedDestinations.value])

// --- Publish execution (R38c) -----------------------------------------

interface TargetProgress {
  current: number
  total: number
  label: string
  status: 'pending' | 'in-progress' | 'done' | 'error'
}
const publishing = ref(false)
const confirming = ref(false)
const progress = ref(new Map<string, TargetProgress>())
const results = ref<PublishResult[] | null>(null)
const publishError = ref<string | null>(null)
const invalidTemplates = ref<{ name: string; errors: string[] }[]>([])

// Production destinations require explicit confirmation to avoid accidental
// pushes to live content — same pattern as the old PublishDialog.
const productionDestinations = computed(() =>
  activeTarget.targets.filter(t =>
    t.environment === 'production' && selectedDestinations.value.has(t.name),
  ),
)
const needsConfirm = computed(() => productionDestinations.value.length > 0)

function resetPublishState() {
  publishing.value = false
  confirming.value = false
  progress.value = new Map()
  results.value = null
  publishError.value = null
  invalidTemplates.value = []
}

async function handlePublishClick() {
  if (!canPublish.value || publishing.value) return
  if (needsConfirm.value && !confirming.value) {
    confirming.value = true
    return
  }
  await runPublish()
}

async function runPublish() {
  const src = sourceName.value
  if (!src) return
  const dests = [...selectedDestinations.value]
  const items = [...selectedItems.value]
  confirming.value = false
  publishing.value = true
  results.value = null
  publishError.value = null
  invalidTemplates.value = []
  progress.value = new Map(dests.map(d => [d, { current: 0, total: 0, label: 'pending…', status: 'pending' as const }]))
  try {
    const finalResults = await api.publishStream(items, dests, (ev) => {
      if (ev.kind === 'target-start') {
        const m = new Map(progress.value)
        m.set(ev.target, { current: 0, total: ev.total, label: 'starting…', status: 'in-progress' })
        progress.value = m
      } else if (ev.kind === 'progress') {
        const m = new Map(progress.value)
        const existing = m.get(ev.target) ?? { current: 0, total: ev.total, label: '', status: 'in-progress' as const }
        m.set(ev.target, { ...existing, current: ev.current, total: ev.total, label: ev.label })
        progress.value = m
      } else if (ev.kind === 'target-result') {
        const m = new Map(progress.value)
        const existing = m.get(ev.result.target)
        if (existing) {
          m.set(ev.result.target, {
            ...existing,
            status: ev.result.success ? 'done' : 'error',
            label: ev.result.success ? `done · ${ev.result.copiedFiles} files` : (ev.result.error ?? 'failed'),
          })
        }
        progress.value = m
      }
    }, { source: src })
    results.value = finalResults
    // Any target that was published is now potentially in a new state —
    // refresh its sync status so chips / item list reflect it.
    for (const d of dests) syncStatus.invalidate(d)
    syncStatus.refreshAll()
  } catch (err) {
    const e = err as Error & { invalidTemplates?: { name: string; errors: string[] }[] }
    publishError.value = e.message
    if (e.invalidTemplates) invalidTemplates.value = e.invalidTemplates
  } finally {
    publishing.value = false
  }
}

// --- Panel lifecycle --------------------------------------------------

watch(() => props.visible, (v) => {
  if (!v) {
    // Clear selection on close so stale state doesn't leak between
    // invocations (e.g., different source next time).
    selectedItems.value = new Set()
    resetPublishState()
    return
  }
  resetPublishState()
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

// Any change to destinations or items invalidates a pending confirmation —
// otherwise the user could flip selections after clicking once and push
// somewhere they didn't review.
watch([selectedDestinations, selectedItems], () => { confirming.value = false })

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
          <template v-for="group in destinationGroups" :key="group.environment">
            <!-- Group header — only when 2+ members. Single-member groups
                 render flat, matching the design's "Groups of 1 stay flat"
                 rule. Click anywhere on the header toggles the group. -->
            <button v-if="group.members.length > 1"
              type="button"
              :class="['destination-group-header', envClass(group.environment)]"
              :data-testid="`publish-dest-group-${group.environment}`"
              @click="toggleGroup(group)">
              <Checkbox
                :modelValue="groupState(group) === 'all'"
                :indeterminate="groupState(group) === 'some'"
                :inputId="`dest-group-${group.environment}`"
                :binary="true"
                :tabindex="-1"
              />
              <span class="group-label">{{ group.environment }}</span>
              <span class="group-count">{{ group.members.length }} targets</span>
            </button>
            <label
              v-for="t in group.members"
              :key="t.name"
              :class="['destination', envClass(t.environment), { grouped: group.members.length > 1 }]"
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
          </template>
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

      <!-- Confirmation banner for production destinations -->
      <div v-if="confirming" class="publish-confirm-banner" data-testid="publish-confirm-banner">
        <i class="pi pi-exclamation-triangle" />
        <span>
          This will publish to
          <strong>{{ productionDestinations.map(t => t.name).join(', ') }}</strong>
          — live content will change.
        </span>
      </div>

      <!-- Invalid templates (fatal) -->
      <div v-if="invalidTemplates.length > 0" class="publish-error" data-testid="publish-invalid-templates">
        <i class="pi pi-exclamation-triangle" />
        <div class="publish-error-body">
          <p><strong>{{ invalidTemplates.length }} template{{ invalidTemplates.length === 1 ? '' : 's' }} can't be rendered.</strong></p>
          <ul class="publish-invalid-list">
            <li v-for="tpl in invalidTemplates" :key="tpl.name">
              <span class="publish-invalid-name">{{ tpl.name }}</span>
              <span class="publish-invalid-error">{{ tpl.errors[0] }}</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- Generic fatal error -->
      <div v-else-if="publishError" class="publish-error" data-testid="publish-error">
        <i class="pi pi-exclamation-circle" />
        <span>{{ publishError }}</span>
      </div>

      <!-- Progress: streaming per-destination -->
      <div v-if="publishing && progress.size > 0" class="publish-progress" data-testid="publish-progress">
        <div v-for="[destName, p] in progress" :key="destName" class="progress-row">
          <div class="progress-header">
            <span class="progress-target">{{ destName }}</span>
            <span class="progress-count">{{ p.current }} / {{ p.total }}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill"
              :style="{ width: (p.total ? Math.round(100 * p.current / p.total) : 0) + '%' }" />
          </div>
          <div class="progress-label" :title="p.label">{{ p.label }}</div>
        </div>
      </div>

      <!-- Results -->
      <div v-if="results" class="publish-results" data-testid="publish-results">
        <div v-for="r in results" :key="r.target" class="publish-result"
          :class="{ success: r.success, error: !r.success }"
          :data-testid="`publish-result-${r.target}`">
          <i :class="r.success ? 'pi pi-check-circle' : 'pi pi-exclamation-circle'" />
          <span class="result-target">{{ r.target }}</span>
          <span v-if="r.success" class="result-detail">{{ r.copiedFiles }} files</span>
          <span v-else class="result-detail">{{ r.error }}</span>
        </div>
      </div>
    </div>

    <template #footer>
      <template v-if="results">
        <Button label="Done" data-testid="publish-panel-done" @click="close" />
      </template>
      <template v-else>
        <Button
          :label="confirming ? 'Back' : 'Cancel'"
          severity="secondary"
          @click="confirming ? (confirming = false) : close()"
          data-testid="publish-panel-cancel" />
        <Button v-if="!confirming"
          :label="publishLabel"
          :icon="publishing ? undefined : 'pi pi-cloud-upload'"
          severity="success"
          :loading="publishing"
          :disabled="!canPublish || publishing"
          :title="publishTitle"
          data-testid="publish-panel-confirm"
          @click="handlePublishClick"
        />
        <Button v-else
          :label="`Yes, publish to ${productionDestinations.map(t => t.name).join(', ')}`"
          icon="pi pi-exclamation-triangle"
          severity="danger"
          :loading="publishing"
          data-testid="publish-panel-confirm-prod"
          @click="runPublish"
        />
      </template>
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
/* Members of a multi-target group — inset slightly and drop the colored
   left border so the group header carries the environment chrome. */
.destination.grouped {
  margin-left: 1.25rem;
  border-left: 1px solid var(--color-border);
}

.destination-group-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.625rem;
  border-radius: var(--p-border-radius-sm);
  font-size: 0.8125rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border: 1px solid var(--color-border);
  margin-bottom: 0.125rem;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  color: inherit;
  text-align: left;
  width: 100%;
}
.destination-group-header:hover { opacity: 0.9; }
.destination-group-header.env-production {
  background: var(--color-env-prod-bg);
  color: var(--color-env-prod-fg);
  border-color: var(--color-env-prod-fg);
}
.destination-group-header.env-staging {
  background: var(--color-env-staging-bg);
  color: var(--color-env-staging-fg);
  border-color: var(--color-env-staging-fg);
}
.group-label { flex: 1; }
.group-count {
  font-size: 0.6875rem;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  opacity: 0.75;
}

.publish-confirm-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: var(--p-border-radius-md);
  background: var(--color-danger-bg);
  color: var(--color-danger-fg);
  font-size: 0.875rem;
}
.publish-error {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: var(--p-border-radius-md);
  background: var(--color-danger-bg);
  color: var(--color-danger-fg);
  font-size: 0.875rem;
}
.publish-error-body { display: flex; flex-direction: column; gap: 0.375rem; flex: 1; }
.publish-error-body p { margin: 0; }
.publish-invalid-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.25rem; }
.publish-invalid-list li { display: flex; flex-direction: column; gap: 0.125rem; font-size: 0.8125rem; }
.publish-invalid-name { font-family: ui-monospace, monospace; font-weight: 600; }
.publish-invalid-error { opacity: 0.85; font-size: 0.75rem; }

.publish-progress { display: flex; flex-direction: column; gap: 0.75rem; }
.progress-row { display: flex; flex-direction: column; gap: 0.25rem; }
.progress-header { display: flex; justify-content: space-between; align-items: baseline; font-size: 0.8125rem; }
.progress-target { font-weight: 600; }
.progress-count { color: var(--color-muted); font-variant-numeric: tabular-nums; font-size: 0.75rem; }
.progress-bar { height: 4px; background: var(--color-hover-bg); border-radius: 2px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--p-primary-color); transition: width 200ms ease; }
.progress-label { font-size: 0.75rem; color: var(--color-muted); font-family: ui-monospace, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.publish-results { display: flex; flex-direction: column; gap: 0.5rem; }
.publish-result { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; border-radius: var(--p-border-radius-md); }
.publish-result.success { background: var(--color-success-bg); color: var(--color-success-fg); }
.publish-result.error { background: var(--color-danger-bg); color: var(--color-danger-fg); }
.result-target { font-weight: 600; }
.result-detail { margin-left: auto; font-size: 0.875rem; opacity: 0.8; }
</style>
