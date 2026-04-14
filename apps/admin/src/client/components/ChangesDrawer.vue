<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Drawer from 'primevue/drawer'
import Select from 'primevue/select'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'
import { api, type CompareResult } from '../api/client.js'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>()

const router = useRouter()

const TARGET_KEY = 'gazetta_changes_target'

const targets = ref<string[]>([])
const selectedTarget = ref<string | null>(null)
const compare = ref<CompareResult | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const lastChecked = ref<number | null>(null)
const showUnchanged = ref(false)
let activeAbort: AbortController | null = null

async function loadTargets() {
  try {
    targets.value = (await api.getTargets()).map(t => t.name)
    const saved = localStorage.getItem(TARGET_KEY)
    if (saved && targets.value.includes(saved)) selectedTarget.value = saved
    else if (targets.value.length) selectedTarget.value = targets.value[0]
  } catch {
    targets.value = []
  }
}

async function runCompare() {
  if (!selectedTarget.value) return
  activeAbort?.abort()
  const ac = new AbortController()
  activeAbort = ac
  loading.value = true
  error.value = null
  try {
    const r = await api.compare(selectedTarget.value, { signal: ac.signal })
    if (ac.signal.aborted) return
    compare.value = r
    lastChecked.value = Date.now()
  } catch (err) {
    if (ac.signal.aborted || (err as Error).name === 'AbortError') return
    error.value = (err as Error).message
    compare.value = null
  } finally {
    if (!ac.signal.aborted) loading.value = false
  }
}

watch(() => props.visible, async (v) => {
  if (!v) {
    activeAbort?.abort()
    return
  }
  if (targets.value.length === 0) await loadTargets()
  if (selectedTarget.value) runCompare()
})

watch(selectedTarget, (t) => {
  if (!t) return
  localStorage.setItem(TARGET_KEY, t)
  if (props.visible) runCompare()
})

type ChangeKind = 'added' | 'modified' | 'deleted'
interface ChangedItem { path: string; change: ChangeKind }
interface Grouped { pages: ChangedItem[]; fragments: ChangedItem[] }

function buildItems(kind: ChangeKind, paths: string[] | undefined): ChangedItem[] {
  return (paths ?? []).map(path => ({ path, change: kind }))
}

const items = computed<ChangedItem[]>(() => {
  const r = compare.value
  if (!r) return []
  return [
    ...buildItems('modified', r.modified),
    ...buildItems('added', r.added),
    ...buildItems('deleted', r.deleted),
  ].sort((a, b) => a.path.localeCompare(b.path))
})

const grouped = computed<Grouped>(() => {
  const pages: ChangedItem[] = []
  const fragments: ChangedItem[] = []
  for (const it of items.value) {
    if (it.path.startsWith('fragments/')) fragments.push(it)
    else pages.push(it)
  }
  return { pages, fragments }
})

const summary = computed(() => {
  let added = 0, modified = 0, deleted = 0
  for (const it of items.value) {
    if (it.change === 'added') added++
    else if (it.change === 'modified') modified++
    else deleted++
  }
  return { added, modified, deleted }
})

const unchangedGrouped = computed<Grouped>(() => {
  const r = compare.value
  const pages: ChangedItem[] = []
  const fragments: ChangedItem[] = []
  for (const p of r?.unchanged ?? []) {
    const item = { path: p, change: 'modified' as ChangeKind } // change unused for unchanged rendering
    if (p.startsWith('fragments/')) fragments.push(item)
    else pages.push(item)
  }
  pages.sort((a, b) => a.path.localeCompare(b.path))
  fragments.sort((a, b) => a.path.localeCompare(b.path))
  return { pages, fragments }
})

const unchangedCount = computed(() => compare.value?.unchanged.length ?? 0)

const isInSync = computed(() =>
  !loading.value && !error.value && compare.value !== null &&
  items.value.length === 0 && !compare.value.firstPublish
)
const isFirstPublish = computed(() =>
  !loading.value && !error.value && compare.value?.firstPublish === true
)

function iconFor(path: string): string {
  return path.startsWith('pages/') ? 'pi pi-file' : 'pi pi-share-alt'
}
function labelFor(path: string): string {
  if (path.startsWith('pages/')) return path.slice('pages/'.length)
  if (path.startsWith('fragments/')) return `@${path.slice('fragments/'.length)}`
  return path
}
function changeSymbol(c: ChangeKind): string {
  if (c === 'added') return '+'
  if (c === 'deleted') return '−'
  return '●'
}

function navigateTo(item: ChangedItem) {
  if (item.change === 'deleted') return
  const [type, ...rest] = item.path.split('/')
  const name = rest.join('/')
  router.push(`/${type}/${name}`)
}

const lastCheckedText = computed(() => {
  if (!lastChecked.value) return ''
  const diff = Math.max(0, Date.now() - lastChecked.value)
  const s = Math.floor(diff / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ago`
})

// Tick for relative timestamp
const now = ref(Date.now())
let tickHandle: ReturnType<typeof setInterval> | null = null
watch(() => props.visible, (v) => {
  if (v && !tickHandle) {
    tickHandle = setInterval(() => { now.value = Date.now() }, 15000)
  } else if (!v && tickHandle) {
    clearInterval(tickHandle)
    tickHandle = null
  }
})

function onUpdateVisible(v: boolean) {
  emit('update:visible', v)
}
</script>

<template>
  <Drawer :visible="props.visible" @update:visible="onUpdateVisible" position="right"
    :style="{ width: 'min(960px, 90vw)' }" data-testid="changes-drawer">
    <template #header>
      <div class="changes-header">
        <span class="changes-title">Changes</span>
        <Button icon="pi pi-refresh" text rounded size="small"
          :disabled="!selectedTarget || loading"
          data-testid="changes-refresh" @click="runCompare" />
      </div>
    </template>

    <div class="changes-body">
      <div v-if="targets.length === 0" class="changes-empty">
        No targets configured in site.yaml
      </div>

      <template v-else>
        <div class="changes-target-row">
          <Select v-model="selectedTarget" :options="targets" placeholder="Select target"
            data-testid="changes-target-select" class="changes-target" />
          <span v-if="lastChecked && !loading" class="changes-lastchecked" :title="new Date(lastChecked).toLocaleString()">
            {{ lastCheckedText }}
          </span>
        </div>

        <div v-if="loading" class="changes-loading" data-testid="changes-loading">
          <ProgressSpinner style="width:20px;height:20px" strokeWidth="6" />
          <span>Comparing…</span>
        </div>

        <div v-else-if="error" class="changes-warning" data-testid="changes-error">
          <i class="pi pi-exclamation-triangle" />
          <div class="changes-warning-body">
            <p>Couldn't load changes</p>
            <p class="changes-warning-detail">{{ error }}</p>
            <Button label="Retry" size="small" text @click="runCompare" />
          </div>
        </div>

        <div v-else-if="isFirstPublish" class="changes-state" data-testid="changes-first-publish">
          <i class="pi pi-info-circle" />
          <span>Nothing has been published to <strong>{{ selectedTarget }}</strong> yet.</span>
        </div>

        <div v-else-if="isInSync" class="changes-state changes-state-sync" data-testid="changes-in-sync">
          <i class="pi pi-check-circle" />
          <span>In sync with <strong>{{ selectedTarget }}</strong>.</span>
        </div>

        <div v-else-if="compare" class="changes-list-wrapper">
          <p class="changes-summary" data-testid="changes-summary">
            <span v-if="summary.modified">{{ summary.modified }} modified</span>
            <span v-if="summary.added">{{ summary.modified ? ' · ' : '' }}{{ summary.added }} added</span>
            <span v-if="summary.deleted">{{ summary.modified || summary.added ? ' · ' : '' }}{{ summary.deleted }} only on target</span>
          </p>

          <div v-if="grouped.pages.length" class="changes-group" data-testid="changes-group-pages">
            <p class="changes-group-label">Pages</p>
            <div class="changes-rows">
              <component :is="item.change === 'deleted' ? 'div' : 'button'"
                v-for="item in grouped.pages" :key="item.path"
                class="changes-row" type="button"
                :class="{ 'changes-row-deleted': item.change === 'deleted' }"
                :data-testid="`changes-item-${item.path}`"
                @click="navigateTo(item)">
                <span class="changes-mark" :class="item.change">{{ changeSymbol(item.change) }}</span>
                <i :class="iconFor(item.path)" class="changes-icon" />
                <span class="changes-label">{{ labelFor(item.path) }}</span>
              </component>
            </div>
          </div>

          <div v-if="grouped.fragments.length" class="changes-group" data-testid="changes-group-fragments">
            <p class="changes-group-label">Fragments</p>
            <div class="changes-rows">
              <component :is="item.change === 'deleted' ? 'div' : 'button'"
                v-for="item in grouped.fragments" :key="item.path"
                class="changes-row" type="button"
                :class="{ 'changes-row-deleted': item.change === 'deleted' }"
                :data-testid="`changes-item-${item.path}`"
                @click="navigateTo(item)">
                <span class="changes-mark" :class="item.change">{{ changeSymbol(item.change) }}</span>
                <i :class="iconFor(item.path)" class="changes-icon" />
                <span class="changes-label">{{ labelFor(item.path) }}</span>
              </component>
            </div>
          </div>

          <div v-if="unchangedCount > 0" class="changes-unchanged">
            <button type="button" class="changes-unchanged-toggle"
              data-testid="changes-unchanged-toggle"
              @click="showUnchanged = !showUnchanged">
              <i :class="showUnchanged ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" />
              <span>{{ unchangedCount }} unchanged</span>
            </button>
            <div v-if="showUnchanged" class="changes-unchanged-body" data-testid="changes-unchanged-body">
              <div v-if="unchangedGrouped.pages.length" class="changes-group">
                <p class="changes-group-label">Pages</p>
                <div class="changes-rows">
                  <button type="button" v-for="item in unchangedGrouped.pages" :key="item.path"
                    class="changes-row changes-row-unchanged"
                    :data-testid="`changes-unchanged-${item.path}`"
                    @click="navigateTo(item)">
                    <span class="changes-mark unchanged">·</span>
                    <i :class="iconFor(item.path)" class="changes-icon" />
                    <span class="changes-label">{{ labelFor(item.path) }}</span>
                  </button>
                </div>
              </div>
              <div v-if="unchangedGrouped.fragments.length" class="changes-group">
                <p class="changes-group-label">Fragments</p>
                <div class="changes-rows">
                  <button type="button" v-for="item in unchangedGrouped.fragments" :key="item.path"
                    class="changes-row changes-row-unchanged"
                    :data-testid="`changes-unchanged-${item.path}`"
                    @click="navigateTo(item)">
                    <span class="changes-mark unchanged">·</span>
                    <i :class="iconFor(item.path)" class="changes-icon" />
                    <span class="changes-label">{{ labelFor(item.path) }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </Drawer>
</template>

<style scoped>
.changes-header { display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 0.5rem; }
.changes-title { font-weight: 600; font-size: 1rem; }
.changes-body { display: flex; flex-direction: column; gap: 1rem; padding-top: 0.25rem; }
.changes-empty { color: var(--color-muted); font-size: 0.875rem; }
.changes-target-row { display: flex; align-items: center; gap: 0.75rem; }
.changes-target { flex: 1; min-width: 0; }
.changes-lastchecked { font-size: 0.75rem; color: var(--color-muted); white-space: nowrap; }
.changes-loading { display: flex; align-items: center; gap: 0.5rem; color: var(--color-muted); font-size: 0.875rem; }
.changes-warning { display: flex; gap: 0.5rem; padding: 0.75rem; border-radius: var(--p-border-radius-md); background: var(--color-danger-bg); color: var(--color-danger-fg); font-size: 0.875rem; }
.changes-warning-body { display: flex; flex-direction: column; gap: 0.375rem; flex: 1; }
.changes-warning-body p { margin: 0; }
.changes-warning-detail { opacity: 0.8; font-size: 0.8125rem; }
.changes-state { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem; border-radius: var(--p-border-radius-md); background: var(--color-info-bg); color: var(--color-info-fg); font-size: 0.875rem; }
.changes-state-sync { background: var(--color-success-bg); color: var(--color-success-fg); }
.changes-summary { font-size: 0.8125rem; color: var(--color-muted); margin: 0; }
.changes-list-wrapper { display: flex; flex-direction: column; gap: 0.75rem; }
.changes-group { display: flex; flex-direction: column; gap: 0.25rem; }
.changes-group-label { font-size: 0.6875rem; text-transform: uppercase; color: var(--color-muted); letter-spacing: 0.05em; font-weight: 600; margin: 0 0 0.125rem 0.25rem; }
.changes-rows { display: flex; flex-direction: column; gap: 0.125rem; }
.changes-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.375rem 0.5rem; border-radius: var(--p-border-radius-sm); background: transparent; border: 0; color: inherit; font: inherit; text-align: left; cursor: pointer; width: 100%; }
.changes-row:hover { background: var(--color-hover-bg); }
.changes-row-deleted { cursor: default; opacity: 0.55; }
.changes-row-deleted:hover { background: transparent; }
.changes-row-unchanged { opacity: 0.75; }
.changes-mark { font-family: monospace; width: 10px; text-align: center; font-weight: bold; flex-shrink: 0; }
.changes-mark.added { color: var(--color-change-added); }
.changes-mark.modified { color: var(--color-change-modified); }
.changes-mark.deleted { color: var(--color-change-deleted); }
.changes-mark.unchanged { color: var(--color-muted); font-weight: normal; }
.changes-icon { color: var(--color-muted); font-size: 0.8rem; flex-shrink: 0; }
.changes-label { font-size: 0.875rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.changes-unchanged { border-top: 1px solid var(--color-border); padding-top: 0.5rem; display: flex; flex-direction: column; gap: 0.5rem; }
.changes-unchanged-toggle { display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0.5rem; border: 0; background: transparent; color: var(--color-muted); font-size: 0.8125rem; cursor: pointer; border-radius: var(--p-border-radius-sm); }
.changes-unchanged-toggle:hover { background: var(--color-hover-bg); color: inherit; }
.changes-unchanged-body { display: flex; flex-direction: column; gap: 0.5rem; }
</style>
