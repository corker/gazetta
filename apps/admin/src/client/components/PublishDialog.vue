<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import ProgressSpinner from 'primevue/progressspinner'
import { api, type CompareResult, type TargetInfo } from '../api/client.js'

const props = defineProps<{ visible: boolean; itemType: string; itemName: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const currentItem = computed(() => `${props.itemType}/${props.itemName}`)

const targets = ref<TargetInfo[]>([])
const selectedTargets = ref<string[]>([])
const publishing = ref(false)
const confirming = ref(false)
const results = ref<Array<{ target: string; success: boolean; error?: string; copiedFiles: number }> | null>(null)

// Per-target compare state
const compareByTarget = ref(new Map<string, CompareResult>())
const compareErrorsByTarget = ref(new Map<string, string>())
const compareLoadingTargets = ref(new Set<string>())
const compareAborts = new Map<string, AbortController>()

// Checked items for publish (defaults to currentItem)
const selectedItems = ref(new Set<string>([currentItem.value]))

onMounted(async () => {
  try {
    targets.value = await api.getTargets()
  } catch {
    targets.value = []
  }
})

onUnmounted(() => abortAllCompares())

function abortAllCompares() {
  for (const ac of compareAborts.values()) ac.abort()
  compareAborts.clear()
}

// Any change in target selection clears the pending confirmation step —
// otherwise user could flip targets after clicking "Publish" once and push
// to a prod target they hadn't reviewed.
watch(selectedTargets, () => { confirming.value = false })

// Start compare for a newly selected target; abort when deselected
watch(selectedTargets, (now, prev) => {
  const added = now.filter(t => !prev?.includes(t))
  const removed = (prev ?? []).filter(t => !now.includes(t))

  for (const t of removed) {
    compareAborts.get(t)?.abort()
    compareAborts.delete(t)
    compareLoadingTargets.value.delete(t)
    compareByTarget.value.delete(t)
    compareErrorsByTarget.value.delete(t)
  }

  for (const t of added) {
    const ac = new AbortController()
    compareAborts.set(t, ac)
    compareLoadingTargets.value.add(t)
    compareErrorsByTarget.value.delete(t)
    api.compare(t, { signal: ac.signal })
      .then(r => {
        if (ac.signal.aborted) return
        compareByTarget.value.set(t, r)
        compareLoadingTargets.value.delete(t)
        // Trigger reactivity on Set/Map updates
        compareByTarget.value = new Map(compareByTarget.value)
        compareLoadingTargets.value = new Set(compareLoadingTargets.value)
      })
      .catch(err => {
        if (ac.signal.aborted || (err as Error).name === 'AbortError') return
        compareErrorsByTarget.value.set(t, (err as Error).message)
        compareLoadingTargets.value.delete(t)
        compareErrorsByTarget.value = new Map(compareErrorsByTarget.value)
        compareLoadingTargets.value = new Set(compareLoadingTargets.value)
      })
  }
})

// Union of added+modified+deleted across selected targets.
// Precedence on display when the same item appears with different changes
// across targets: added > modified > deleted. Deleted items are informational
// only (no checkbox, no action — they're gone locally, user deletes on target
// by other means).
type ChangeKind = 'added' | 'modified' | 'deleted'
interface ChangedItem { path: string; change: ChangeKind }
const PRECEDENCE: Record<ChangeKind, number> = { added: 0, modified: 1, deleted: 2 }

const changedItems = computed<ChangedItem[]>(() => {
  const map = new Map<string, ChangedItem>()
  const bump = (path: string, change: ChangeKind) => {
    const existing = map.get(path)
    if (!existing || PRECEDENCE[change] < PRECEDENCE[existing.change]) {
      map.set(path, { path, change })
    }
  }
  for (const target of selectedTargets.value) {
    const r = compareByTarget.value.get(target)
    if (!r) continue
    for (const p of r.added) bump(p, 'added')
    for (const p of r.modified) bump(p, 'modified')
    for (const p of r.deleted) bump(p, 'deleted')
  }
  return [...map.values()].sort((a, b) => a.path.localeCompare(b.path))
})

// Grouping by kind (pages vs fragments) and summary counts
interface GroupedItems {
  pages: ChangedItem[]
  fragments: ChangedItem[]
}
const grouped = computed<GroupedItems>(() => {
  const pages: ChangedItem[] = []
  const fragments: ChangedItem[] = []
  for (const item of changedItems.value) {
    if (item.path.startsWith('fragments/')) fragments.push(item)
    else pages.push(item)
  }
  return { pages, fragments }
})

const summary = computed(() => {
  let added = 0, modified = 0, deleted = 0
  for (const item of changedItems.value) {
    if (item.change === 'added') added++
    else if (item.change === 'modified') modified++
    else deleted++
  }
  return { added, modified, deleted }
})

const anyLoading = computed(() => compareLoadingTargets.value.size > 0)
// Targets with environment === 'production' require an explicit confirmation
// step before publishing, so users can't silently push to live content.
const productionTargetsSelected = computed(() =>
  targets.value.filter(t => t.environment === 'production' && selectedTargets.value.includes(t.name))
)
const needsConfirm = computed(() => productionTargetsSelected.value.length > 0)
// Publish is blocked while compare is still running — otherwise a hasty click
// falls back to publishing only the currently-edited item, which users rarely
// intend when the changes panel is still about to populate.
// Invalid templates surface across all selected targets — templates are
// scanned once per compare, but any target can report errors. Dedupe by name.
const invalidTemplates = computed(() => {
  const seen = new Map<string, string[]>()
  for (const t of selectedTargets.value) {
    const r = compareByTarget.value.get(t)
    if (!r) continue
    for (const tpl of r.invalidTemplates) {
      if (!seen.has(tpl.name)) seen.set(tpl.name, tpl.errors)
    }
  }
  return [...seen.entries()].map(([name, errors]) => ({ name, errors }))
})
const hasInvalidTemplates = computed(() => invalidTemplates.value.length > 0)
const publishBlocked = computed(() =>
  selectedTargets.value.length === 0 || anyLoading.value || publishing.value || hasInvalidTemplates.value
)
const publishDisabledReason = computed(() => {
  if (selectedTargets.value.length === 0) return 'Select at least one target'
  if (anyLoading.value) return 'Loading changes…'
  if (hasInvalidTemplates.value) return 'Fix invalid templates before publishing'
  return ''
})
const anyCompareDone = computed(() => compareByTarget.value.size > 0)
const anyFirstPublish = computed(() => {
  for (const t of selectedTargets.value) {
    if (compareByTarget.value.get(t)?.firstPublish) return true
  }
  return false
})
const compareError = computed(() => {
  // Report first error (targets usually share config; showing one is enough)
  for (const t of selectedTargets.value) {
    const e = compareErrorsByTarget.value.get(t)
    if (e) return e
  }
  return null
})

// Keep currentItem pre-checked whenever it appears in the changed list.
// Deleted items are informational (never selectable) — they're already gone
// locally, publish would be a no-op.
const deletedPaths = computed(() => new Set(
  changedItems.value.filter(i => i.change === 'deleted').map(i => i.path)
))

watch(changedItems, (items) => {
  const paths = new Set(items.map(i => i.path))
  const kept = new Set<string>()
  for (const p of selectedItems.value) {
    if (deletedPaths.value.has(p)) continue
    if (paths.has(p) || p === currentItem.value) kept.add(p)
  }
  if (!deletedPaths.value.has(currentItem.value)) kept.add(currentItem.value)
  selectedItems.value = kept
})

function toggleItem(path: string) {
  if (deletedPaths.value.has(path)) return // deleted items are informational
  const s = new Set(selectedItems.value)
  if (s.has(path)) s.delete(path)
  else s.add(path)
  selectedItems.value = s
}

async function onPublishClick() {
  if (publishBlocked.value) return
  if (needsConfirm.value && !confirming.value) {
    confirming.value = true
    return
  }
  await handlePublish()
}

async function handlePublish() {
  if (selectedTargets.value.length === 0) return
  confirming.value = false
  abortAllCompares()
  publishing.value = true
  results.value = null
  try {
    // If firstPublish for any target: publish ALL local items
    let items: string[]
    if (anyFirstPublish.value) {
      // Use added list from the first-publish target (they'll all be the same since target is empty)
      const firstPubTarget = selectedTargets.value.find(t => compareByTarget.value.get(t)?.firstPublish)
      const r = firstPubTarget ? compareByTarget.value.get(firstPubTarget) : null
      items = r ? r.added : [currentItem.value]
    } else if (!anyCompareDone.value || compareError.value) {
      // No compare data — fall back to current item only (pre-#108 safe behavior)
      items = [currentItem.value]
    } else {
      items = [...selectedItems.value]
      if (items.length === 0) items = [currentItem.value]
    }
    const response = await api.publish(items, selectedTargets.value)
    results.value = response.results
  } catch (err) {
    results.value = [{ target: '(all)', success: false, error: (err as Error).message, copiedFiles: 0 }]
  } finally {
    publishing.value = false
  }
}

function iconFor(item: string): string {
  return item.startsWith('pages/') ? 'pi pi-file' : 'pi pi-share-alt'
}

function labelFor(item: string): string {
  if (item.startsWith('pages/')) return item.slice('pages/'.length)
  if (item.startsWith('fragments/')) return `@${item.slice('fragments/'.length)}`
  return item
}

function changeSymbol(change: ChangeKind): string {
  if (change === 'added') return '+'
  if (change === 'deleted') return '−'
  return '●'
}

function onClose() {
  abortAllCompares()
  emit('close')
}
</script>

<template>
  <Dialog :visible="props.visible" @update:visible="onClose" modal header="Publish" :style="{ width: '32rem' }">
    <div class="publish-content">
      <p class="publish-item" data-testid="publish-current-item">
        <i :class="iconFor(currentItem)" />
        {{ labelFor(currentItem) }}
      </p>

      <div v-if="targets.length === 0" class="publish-empty">
        No targets configured in site.yaml
      </div>

      <template v-else-if="!results">
        <div class="publish-targets">
          <p class="publish-label">Select targets</p>
          <div v-for="target in targets" :key="target.name" class="publish-target">
            <Checkbox v-model="selectedTargets" :inputId="target.name" :value="target.name" :data-testid="`publish-target-${target.name}`" />
            <label :for="target.name" class="publish-target-label">
              {{ target.name }}
              <span v-if="target.environment === 'production'" class="publish-env-badge publish-env-prod">prod</span>
              <span v-else-if="target.environment === 'staging'" class="publish-env-badge publish-env-staging">staging</span>
            </label>
            <ProgressSpinner v-if="compareLoadingTargets.has(target.name)" style="width:14px;height:14px" strokeWidth="6" />
          </div>
        </div>

        <div v-if="hasInvalidTemplates" class="publish-warning" data-testid="publish-invalid-templates">
          <i class="pi pi-exclamation-triangle" />
          <div class="publish-invalid-body">
            <p><strong>{{ invalidTemplates.length }} template{{ invalidTemplates.length === 1 ? '' : 's' }} can't be rendered.</strong> Publish is blocked until fixed.</p>
            <ul class="publish-invalid-list">
              <li v-for="tpl in invalidTemplates" :key="tpl.name">
                <span class="publish-invalid-name">{{ tpl.name }}</span>
                <span class="publish-invalid-error">{{ tpl.errors[0] }}</span>
              </li>
            </ul>
          </div>
        </div>

        <div v-if="confirming" class="publish-confirm-banner" data-testid="publish-confirm-banner">
          <i class="pi pi-exclamation-triangle" />
          <span>
            This will publish to
            <strong>{{ productionTargetsSelected.map(t => t.name).join(', ') }}</strong>
            — live content will change.
          </span>
        </div>

        <div v-if="compareError" class="publish-warning" data-testid="publish-compare-error">
          <i class="pi pi-exclamation-triangle" />
          <span>Couldn't load changes: {{ compareError }}</span>
        </div>

        <div v-else-if="anyFirstPublish" class="publish-firstpublish" data-testid="publish-first-publish">
          <i class="pi pi-info-circle" />
          <span>First publish — everything will be published.</span>
        </div>

        <div v-else-if="selectedTargets.length > 0" class="publish-changes">
          <p class="publish-label">
            Changes
            <span v-if="anyLoading" class="publish-label-hint">loading…</span>
            <span v-else-if="changedItems.length" class="publish-label-hint" data-testid="publish-summary">
              <span v-if="summary.modified">{{ summary.modified }} modified</span>
              <span v-if="summary.added">{{ summary.modified ? ' · ' : '' }}{{ summary.added }} added</span>
              <span v-if="summary.deleted">{{ summary.modified || summary.added ? ' · ' : '' }}{{ summary.deleted }} only on target</span>
            </span>
          </p>
          <div v-if="!anyLoading && changedItems.length === 0" class="publish-nochanges">
            No changes to publish.
          </div>
          <template v-else>
            <div v-if="grouped.pages.length" class="publish-changes-group" data-testid="publish-group-pages">
              <p class="publish-group-label">Pages</p>
              <div class="publish-changes-list">
                <component :is="item.change === 'deleted' ? 'div' : 'label'"
                  v-for="item in grouped.pages" :key="item.path"
                  class="publish-change-row"
                  :class="{ 'publish-change-row-deleted': item.change === 'deleted' }"
                  :data-testid="`publish-change-${item.path}`">
                  <Checkbox v-if="item.change !== 'deleted'"
                    :modelValue="selectedItems.has(item.path)" :binary="true"
                    @update:modelValue="toggleItem(item.path)" />
                  <span v-else class="publish-change-nocheckbox" />
                  <span class="publish-change-mark" :class="item.change">{{ changeSymbol(item.change) }}</span>
                  <i :class="iconFor(item.path)" class="publish-change-icon" />
                  <span class="publish-change-label">{{ labelFor(item.path) }}</span>
                </component>
              </div>
            </div>
            <div v-if="grouped.fragments.length" class="publish-changes-group" data-testid="publish-group-fragments">
              <p class="publish-group-label">Fragments</p>
              <div class="publish-changes-list">
                <component :is="item.change === 'deleted' ? 'div' : 'label'"
                  v-for="item in grouped.fragments" :key="item.path"
                  class="publish-change-row"
                  :class="{ 'publish-change-row-deleted': item.change === 'deleted' }"
                  :data-testid="`publish-change-${item.path}`">
                  <Checkbox v-if="item.change !== 'deleted'"
                    :modelValue="selectedItems.has(item.path)" :binary="true"
                    @update:modelValue="toggleItem(item.path)" />
                  <span v-else class="publish-change-nocheckbox" />
                  <span class="publish-change-mark" :class="item.change">{{ changeSymbol(item.change) }}</span>
                  <i :class="iconFor(item.path)" class="publish-change-icon" />
                  <span class="publish-change-label">{{ labelFor(item.path) }}</span>
                </component>
              </div>
            </div>
          </template>
        </div>
      </template>

      <div v-else class="publish-results">
        <div v-for="result in results" :key="result.target" class="publish-result"
          :class="{ success: result.success, error: !result.success }">
          <i :class="result.success ? 'pi pi-check-circle' : 'pi pi-exclamation-circle'" />
          <span class="result-target">{{ result.target }}</span>
          <span v-if="result.success" class="result-detail">{{ result.copiedFiles }} files</span>
          <span v-else class="result-detail">{{ result.error }}</span>
        </div>
      </div>
    </div>

    <template #footer>
      <Button v-if="results" label="Done" data-testid="publish-done" @click="onClose" />
      <template v-else>
        <Button :label="confirming ? 'Back' : 'Cancel'" severity="secondary" text
          @click="confirming ? (confirming = false) : onClose()" />
        <Button v-if="!confirming"
          label="Publish" icon="pi pi-cloud-upload" :loading="publishing"
          data-testid="publish-submit"
          :title="publishDisabledReason"
          :disabled="publishBlocked" @click="onPublishClick" />
        <Button v-else
          :label="`Yes, publish to ${productionTargetsSelected.map(t => t.name).join(', ')}`"
          icon="pi pi-exclamation-triangle" severity="danger" :loading="publishing"
          data-testid="publish-confirm"
          @click="handlePublish" />
      </template>
    </template>
  </Dialog>
</template>

<style scoped>
.publish-content { display: flex; flex-direction: column; gap: 1rem; }
.publish-item { display: flex; align-items: center; gap: 0.5rem; font-weight: 600; font-size: 1rem; }
.publish-empty { color: #888; font-size: 0.875rem; }
.publish-label { font-size: 0.75rem; text-transform: uppercase; color: #888; letter-spacing: 0.03em; display: flex; align-items: center; gap: 0.5rem; }
.publish-label-hint { text-transform: none; letter-spacing: 0; font-size: 0.75rem; color: #6b7280; font-weight: normal; }
.publish-targets { display: flex; flex-direction: column; gap: 0.5rem; }
.publish-target { display: flex; align-items: center; gap: 0.5rem; }
.publish-target label { cursor: pointer; }
.publish-warning { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; border-radius: 6px; background: #450a0a; color: #f87171; font-size: 0.875rem; }
.publish-firstpublish { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; border-radius: 6px; background: #1e3a5f; color: #93c5fd; font-size: 0.875rem; }
.publish-confirm-banner { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; border-radius: 6px; background: #450a0a; color: #fca5a5; font-size: 0.875rem; }
.publish-invalid-body { display: flex; flex-direction: column; gap: 0.375rem; flex: 1; }
.publish-invalid-body p { margin: 0; }
.publish-invalid-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.25rem; }
.publish-invalid-list li { display: flex; flex-direction: column; gap: 0.125rem; font-size: 0.8125rem; }
.publish-invalid-name { font-family: monospace; font-weight: 600; }
.publish-invalid-error { opacity: 0.85; font-size: 0.75rem; }
.publish-target-label { display: inline-flex; align-items: center; gap: 0.5rem; cursor: pointer; }
.publish-env-badge { font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.03em; padding: 0.125rem 0.375rem; border-radius: 4px; font-weight: 600; }
.publish-env-prod { background: #450a0a; color: #fca5a5; }
.publish-env-staging { background: #422006; color: #fbbf24; }
.publish-changes { display: flex; flex-direction: column; gap: 0.5rem; }
.publish-nochanges { color: #888; font-size: 0.875rem; }
.publish-changes-group { display: flex; flex-direction: column; gap: 0.25rem; }
.publish-changes-group + .publish-changes-group { margin-top: 0.5rem; }
.publish-group-label { font-size: 0.6875rem; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; font-weight: 600; margin: 0 0 0.125rem 0.25rem; }
.publish-changes-list { display: flex; flex-direction: column; gap: 0.125rem; max-height: 240px; overflow-y: auto; }
.publish-change-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.375rem 0.5rem; border-radius: 4px; cursor: pointer; }
.publish-change-row:hover { background: rgba(128, 128, 128, 0.1); }
.publish-change-row-deleted { cursor: default; opacity: 0.55; }
.publish-change-row-deleted:hover { background: transparent; }
.publish-change-nocheckbox { display: inline-block; width: 20px; flex-shrink: 0; }
.publish-change-mark { font-family: monospace; width: 10px; text-align: center; font-weight: bold; }
.publish-change-mark.added { color: #4ade80; }
.publish-change-mark.modified { color: #fbbf24; }
.publish-change-mark.deleted { color: #9ca3af; }
.publish-change-icon { color: #888; font-size: 0.8rem; }
.publish-change-label { font-size: 0.875rem; }
.publish-results { display: flex; flex-direction: column; gap: 0.5rem; }
.publish-result { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; border-radius: 6px; }
.publish-result.success { background: #052e16; color: #4ade80; }
.publish-result.error { background: #450a0a; color: #f87171; }
.result-target { font-weight: 600; }
.result-detail { margin-left: auto; font-size: 0.875rem; opacity: 0.8; }
</style>

<style>
/* Light mode overrides (scoped :global doesn't beat Vue's data-v- hashes; see team preferences #12) */
.light .publish-changes-list .publish-change-row:hover { background: rgba(0, 0, 0, 0.04); }
.light .publish-warning { background: #fef2f2; color: #991b1b; }
.light .publish-firstpublish { background: #eff6ff; color: #1e40af; }
.light .publish-confirm-banner { background: #fef2f2; color: #991b1b; }
.light .publish-env-prod { background: #fee2e2; color: #991b1b; }
.light .publish-env-staging { background: #fef3c7; color: #92400e; }
.light .publish-change-mark.added { color: #15803d; }
.light .publish-change-mark.modified { color: #a16207; }
.light .publish-change-mark.deleted { color: #6b7280; }
.light .publish-group-label { color: #4b5563; }
.light .publish-result.success { background: #dcfce7; color: #15803d; }
.light .publish-result.error { background: #fef2f2; color: #991b1b; }
</style>
