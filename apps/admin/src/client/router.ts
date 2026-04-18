import { createRouter as createVueRouter, createWebHistory } from 'vue-router'
import EditorView from './components/EditorView.vue'
import DevPlayground from './components/DevPlayground.vue'
import { useSiteStore } from './stores/site.js'
import { useSelectionStore } from './stores/selection.js'
import { useEditingStore } from './stores/editing.js'
import { useUiModeStore } from './stores/uiMode.js'
import { useUnsavedGuardStore } from './stores/unsavedGuard.js'
import { useActiveTargetStore } from './stores/activeTarget.js'

export function createRouter() {
  const base = import.meta.env.BASE_URL || '/'
  const router = createVueRouter({
    history: createWebHistory(base),
    routes: [
      { path: '/', component: EditorView, name: 'home' },
      { path: '/pages/:name', component: EditorView, name: 'page-browse' },
      { path: '/pages/:name/edit', component: EditorView, name: 'page-edit' },
      { path: '/fragments/:name', component: EditorView, name: 'fragment-browse' },
      { path: '/fragments/:name/edit', component: EditorView, name: 'fragment-edit' },
      { path: '/dev', component: DevPlayground, name: 'dev' },
      { path: '/dev/editor/:editor', component: DevPlayground, name: 'dev-editor' },
      { path: '/dev/field/:field', component: DevPlayground, name: 'dev-field' },
      { path: '/:pathMatch(.*)*', redirect: '/' },
    ],
  })

  router.beforeEach(async (to, from) => {
    const site = useSiteStore()
    await site.ensureLoaded()

    // Skip guard for non-editor routes
    const isDev = (name: string | undefined) => name?.toString().startsWith('dev')
    const isEditorRoute = !isDev(to.name?.toString()) && to.name !== 'home'
    const wasEditorRoute = from.name && !isDev(from.name.toString()) && from.name !== 'home'

    // Unsaved guard — check when leaving a page/fragment with pending edits
    if (wasEditorRoute) {
      const editing = useEditingStore()
      const fromName = from.params.name as string | undefined
      const toName = to.params.name as string | undefined
      const fromType = from.name?.toString().startsWith('page') ? 'page' : 'fragment'
      const toType = to.name?.toString().startsWith('page') ? 'page' : 'fragment'
      const fromEdit = from.name?.toString().endsWith('-edit')
      const toEdit = to.name?.toString().endsWith('-edit')
      const leavingPage = !isEditorRoute || fromName !== toName || fromType !== toType
      const leavingEdit = fromEdit && !toEdit

      if ((leavingPage || leavingEdit) && editing.hasPendingEdits) {
        const guard = useUnsavedGuardStore()
        const result = await guard.guard()
        if (result === 'cancel') return false
        if (result === 'save') await editing.save()
        editing.clear()
      }
    }

    // Sync active target from URL query param.
    // ?target=staging → switch to staging. No ?target= → use default (first editable).
    // Only non-default targets appear in the URL — keeps default URLs clean.
    const activeTarget = useActiveTargetStore()
    const urlTarget = to.query.target as string | undefined
    if (urlTarget) {
      // Strip ?target= if it's the default — keep URLs clean
      if (urlTarget === activeTarget.defaultTargetName) {
        const { target: _, ...rest } = to.query
        return { ...to, query: rest }
      }
      if (urlTarget !== activeTarget.activeTargetName) {
        try {
          activeTarget.setActiveTarget(urlTarget)
        } catch {
          const { target: _, ...rest } = to.query
          return { ...to, query: rest }
        }
      }
    } else if (activeTarget.activeTargetName !== activeTarget.defaultTargetName) {
      // No ?target= — reset to default
      activeTarget.resetToDefault()
    }

    // Hydrate selection from route params
    if (isEditorRoute) {
      const selection = useSelectionStore()
      const uiMode = useUiModeStore()
      const name = to.params.name as string
      const type = to.name?.toString().startsWith('page') ? 'page' : 'fragment'
      const isEdit = to.name?.toString().endsWith('-edit')

      // Select page/fragment if different from current
      if (selection.type !== type || selection.name !== name) {
        if (type === 'page') await selection.selectPage(name)
        else await selection.selectFragment(name)
      }

      // Set mode
      if (isEdit && uiMode.mode !== 'edit') uiMode.enterEdit()
      else if (!isEdit && uiMode.mode === 'edit') uiMode.enterBrowse()
    } else if (to.name === 'home') {
      const uiMode = useUiModeStore()
      if (uiMode.mode === 'edit') uiMode.enterBrowse()
    }
  })

  return router
}
