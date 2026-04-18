/**
 * Component tests for ComponentTree.vue.
 *
 * Scope: tree rendering and fragment resolution.
 *   - Build tree from selection.detail (pages, fragments, inline components)
 *   - Fragment references (@name) resolved via FragmentsApi
 *   - Error path when a fragment fetch fails
 *   - Node icons per type
 *   - Dirty indicators (editing store state → dot + revert button)
 *   - onSelect routing to the right editing.open* action
 *
 * Out of scope here (would need unsaved-guard dialog + AddComponentDialog
 * end-to-end):
 *   - moveComponent, removeComponent, addComponent actions
 *
 * Uses the composable DI from PR#149: FragmentsApi is injected via
 * `global.provide` so a fake replaces the real module singleton.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import ComponentTree from '../src/client/components/ComponentTree.vue'
import { FRAGMENTS_API, type FragmentsApi } from '../src/client/composables/api.js'
import { useSelectionStore } from '../src/client/stores/selection.js'
import { useEditingStore } from '../src/client/stores/editing.js'
import type { PageDetail, FragmentDetail } from '../src/client/api/client.js'

/** Minimal FragmentsApi fake — each method throws unless the test provides an impl. */
function fakeFragmentsApi(partial: Partial<FragmentsApi> = {}): FragmentsApi {
  const notImplemented = (name: string) => () => {
    throw new Error(`fakeFragmentsApi.${name} not stubbed`)
  }
  return {
    getFragments: notImplemented('getFragments'),
    getFragment: notImplemented('getFragment'),
    createFragment: notImplemented('createFragment'),
    deleteFragment: notImplemented('deleteFragment'),
    updateFragment: notImplemented('updateFragment'),
    getDependents: notImplemented('getDependents'),
    ...partial,
  } as FragmentsApi
}

function mountTree(fragmentsApi: FragmentsApi) {
  return mount(ComponentTree, {
    global: {
      plugins: [PrimeVue],
      provide: { [FRAGMENTS_API as symbol]: fragmentsApi },
      stubs: { AddComponentDialog: true },
    },
  })
}

/**
 * Install a page as the current selection. Short-circuits the store's
 * own selectPage() (which would call api.getPage) — we set detail
 * directly via the reactive ref.
 */
function setPageSelection(detail: PageDetail) {
  const sel = useSelectionStore()
  sel.selection = { type: 'page', name: detail.name, detail }
}

function setFragmentSelection(detail: FragmentDetail) {
  const sel = useSelectionStore()
  sel.selection = { type: 'fragment', name: detail.name, detail }
}

/**
 * Wait a tick for watchers (selection.detail is watched immediately +
 * buildComponentNode is async).
 */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise(r => setTimeout(r, 0))
}

describe('ComponentTree', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders nothing when there is no selection', () => {
    const w = mountTree(fakeFragmentsApi())
    expect(w.find('.component-tree').exists()).toBe(false)
  })

  it('renders the page root node when a page is selected', async () => {
    setPageSelection({
      name: 'home',
      route: '/',
      template: 'page-default',
      dir: 'pages/home',
      components: [],
    })
    const w = mountTree(fakeFragmentsApi())
    await flushMicrotasks()
    expect(w.find('[data-testid="component-home"]').exists()).toBe(true)
  })

  it('renders inline components as tree nodes', async () => {
    setPageSelection({
      name: 'home',
      route: '/',
      template: 'page-default',
      dir: 'pages/home',
      components: [
        { name: 'hero', template: 'hero', content: { title: 'Hi' } },
        { name: 'features', template: 'features-grid' },
      ],
    })
    const w = mountTree(fakeFragmentsApi())
    await flushMicrotasks()
    expect(w.find('[data-testid="component-hero"]').exists()).toBe(true)
    expect(w.find('[data-testid="component-features"]').exists()).toBe(true)
  })

  it('resolves @fragment references via FragmentsApi', async () => {
    const getFragment = vi.fn(
      async (name: string): Promise<FragmentDetail> => ({
        name,
        template: 'header-layout',
        dir: `fragments/${name}`,
        components: [{ name: 'logo', template: 'logo' }],
      }),
    )
    setPageSelection({
      name: 'home',
      route: '/',
      template: 'page-default',
      dir: 'pages/home',
      components: ['@header'],
    })
    const w = mountTree(fakeFragmentsApi({ getFragment }))
    await flushMicrotasks()
    expect(getFragment).toHaveBeenCalledWith('header')
    // The fragment itself and its child (logo) should render
    expect(w.find('[data-testid="component-header"]').exists()).toBe(true)
    expect(w.find('[data-testid="component-logo"]').exists()).toBe(true)
  })

  it('shows an error icon when a fragment fetch fails', async () => {
    const getFragment = vi.fn(async () => {
      throw new Error('not found')
    })
    setPageSelection({
      name: 'home',
      route: '/',
      template: 'page-default',
      dir: 'pages/home',
      components: ['@missing'],
    })
    const w = mountTree(fakeFragmentsApi({ getFragment }))
    await flushMicrotasks()
    const node = w.find('[data-testid="component-missing"]')
    expect(node.exists()).toBe(true)
    expect(node.find('.node-error-icon').exists()).toBe(true)
    expect(node.find('.node-error-icon').attributes('title')).toBe('not found')
  })

  it('shows the dirty-dot when the editing store has unsaved edits on the component path', async () => {
    setPageSelection({
      name: 'home',
      route: '/',
      template: 'page-default',
      dir: 'pages/home',
      components: [{ name: 'hero', template: 'hero', content: { title: 'Hi' } }],
    })
    const editing = useEditingStore()
    // Simulate a pending edit on the hero component's path.
    editing.pendingEdits.set('hero', {
      target: { path: 'hero', template: 'hero', content: { title: 'Hi' }, hasEditor: false, save: async () => {} },
      editedContent: { title: 'Updated' },
    })

    const w = mountTree(fakeFragmentsApi())
    await flushMicrotasks()
    const hero = w.find('[data-testid="component-hero"]')
    expect(hero.find('.node-dirty-dot').exists()).toBe(true)
  })

  it('renders a fragment selection as its own root', async () => {
    setFragmentSelection({
      name: 'header',
      template: 'header-layout',
      dir: 'fragments/header',
      components: [{ name: 'logo', template: 'logo' }],
    })
    const w = mountTree(fakeFragmentsApi())
    await flushMicrotasks()
    expect(w.find('[data-testid="component-header"]').exists()).toBe(true)
    expect(w.find('[data-testid="component-logo"]').exists()).toBe(true)
  })

  it('clicking a fragment root in page context calls showFragmentLink', async () => {
    const getFragment = vi.fn(
      async (): Promise<FragmentDetail> => ({
        name: 'header',
        template: 'header-layout',
        dir: 'fragments/header',
        components: [{ name: 'logo', template: 'logo' }],
      }),
    )
    setPageSelection({
      name: 'home',
      route: '/',
      template: 'page-default',
      dir: 'pages/home',
      components: ['@header'],
    })
    const editing = useEditingStore()
    const spy = vi.spyOn(editing, 'showFragmentLink')
    const w = mountTree(fakeFragmentsApi({ getFragment }))
    await flushMicrotasks()
    await w.find('[data-testid="component-header"]').trigger('click')
    expect(spy).toHaveBeenCalledWith('header')
    expect(editing.fragmentLink).toBe('header')
  })

  it('clicking a fragment child in page context calls showFragmentLink with treePath', async () => {
    const getFragment = vi.fn(
      async (): Promise<FragmentDetail> => ({
        name: 'header',
        template: 'header-layout',
        dir: 'fragments/header',
        components: [{ name: 'logo', template: 'logo' }],
      }),
    )
    setPageSelection({
      name: 'home',
      route: '/',
      template: 'page-default',
      dir: 'pages/home',
      components: ['@header'],
    })
    const editing = useEditingStore()
    const spy = vi.spyOn(editing, 'showFragmentLink')
    const w = mountTree(fakeFragmentsApi({ getFragment }))
    await flushMicrotasks()
    await w.find('[data-testid="component-logo"]').trigger('click')
    expect(spy).toHaveBeenCalledWith('@header/logo')
    expect(editing.fragmentLink).toBe('header')
  })

  it('clicking a fragment root in fragment context calls openFragment', async () => {
    const getFragment = vi.fn(
      async (): Promise<FragmentDetail> => ({
        name: 'nav',
        template: 'nav',
        dir: 'fragments/nav',
        components: [],
      }),
    )
    setFragmentSelection({
      name: 'header',
      template: 'header-layout',
      dir: 'fragments/header',
      components: ['@nav'],
    })
    const editing = useEditingStore()
    const spy = vi.spyOn(editing, 'openFragment')
    const w = mountTree(fakeFragmentsApi({ getFragment }))
    await flushMicrotasks()
    await w.find('[data-testid="component-nav"]').trigger('click')
    expect(spy).toHaveBeenCalledWith('nav')
  })

  it('showFragmentLink stashes dirty edits before clearing', () => {
    const editing = useEditingStore()
    // Simulate a dirty editor state
    editing.$patch({
      target: { path: 'hero', template: 'hero', content: { title: 'old' }, save: async () => {} },
      content: { title: 'changed' },
      saved: { title: 'old' },
    })
    expect(editing.dirty).toBe(true)
    editing.showFragmentLink('footer')
    // Dirty edits should be stashed in pendingEdits
    expect(editing.pendingEdits.has('hero')).toBe(true)
    expect(editing.pendingEdits.get('hero')!.editedContent).toEqual({ title: 'changed' })
    // Editor should be cleared
    expect(editing.target).toBeNull()
    expect(editing.fragmentLink).toBe('footer')
  })

  it('showFragmentLink extracts fragment name from treePath', () => {
    const editing = useEditingStore()
    editing.showFragmentLink('@header/logo')
    expect(editing.fragmentLink).toBe('header')
  })

  it('clears selectedNodeKey when tree rebuilds for new selection', async () => {
    const getFragment = vi.fn(
      async (): Promise<FragmentDetail> => ({
        name: 'header',
        template: 'header-layout',
        dir: 'fragments/header',
        components: [{ name: 'logo', template: 'logo' }],
      }),
    )
    setPageSelection({
      name: 'home',
      route: '/',
      template: 'page-default',
      dir: 'pages/home',
      components: ['@header'],
    })
    const w = mountTree(fakeFragmentsApi({ getFragment }))
    await flushMicrotasks()
    // Click logo to select it
    await w.find('[data-testid="component-logo"]').trigger('click')
    expect(w.find('[data-testid="component-logo"].selected').exists()).toBe(true)
    // Switch to fragment selection — tree rebuilds
    setFragmentSelection({
      name: 'header',
      template: 'header-layout',
      dir: 'fragments/header',
      components: [{ name: 'logo', template: 'logo' }],
    })
    await flushMicrotasks()
    // No node should be selected after rebuild
    expect(w.find('.selected').exists()).toBe(false)
  })

  it('reuses the FragmentsApi for nested fragment references', async () => {
    const getFragment = vi.fn(async (name: string): Promise<FragmentDetail> => {
      if (name === 'header') {
        return {
          name: 'header',
          template: 'header-layout',
          dir: 'fragments/header',
          components: ['@nav'],
        }
      }
      return {
        name: 'nav',
        template: 'nav',
        dir: 'fragments/nav',
        components: [],
      }
    })
    setPageSelection({
      name: 'home',
      route: '/',
      template: 'page-default',
      dir: 'pages/home',
      components: ['@header'],
    })
    const w = mountTree(fakeFragmentsApi({ getFragment }))
    await flushMicrotasks()
    expect(getFragment).toHaveBeenCalledWith('header')
    expect(getFragment).toHaveBeenCalledWith('nav')
    expect(w.find('[data-testid="component-header"]').exists()).toBe(true)
    expect(w.find('[data-testid="component-nav"]').exists()).toBe(true)
  })
})
