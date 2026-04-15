/**
 * Workspace chrome — applies environment-scoped body classes based on the
 * active target. Implements the "permanence" rule from design-editor-ux.md:
 *
 *   Transient peek (tab swap to prod, read-only):  subtle chrome on the
 *     indicator only — the workspace stays quiet.
 *   Permanent edit (author deliberately made prod editable + active):
 *     full workspace chrome — red edges, heightened warnings. Every save
 *     goes live; the author needs a constant visual reminder.
 *
 * This composable owns the latter. It adds `workspace-editable-prod` to
 * the document body when the active target is both tagged `production`
 * AND marked editable. Other environments don't trigger workspace-wide
 * chrome (the ActiveTargetIndicator pill carries their color).
 */
import { watch, onScopeDispose } from 'vue'
import { useActiveTargetStore } from '../stores/activeTarget.js'

const EDITABLE_PROD_CLASS = 'workspace-editable-prod'

export function useWorkspaceChrome() {
  const activeTarget = useActiveTargetStore()

  function apply() {
    if (typeof document === 'undefined') return
    const t = activeTarget.activeTarget
    const shouldMark = !!t && t.environment === 'production' && t.editable
    document.body.classList.toggle(EDITABLE_PROD_CLASS, shouldMark)
  }

  // Re-evaluate whenever the active target (or its shape) changes.
  const stop = watch(
    () => [activeTarget.activeTargetName, activeTarget.activeTarget?.editable, activeTarget.activeTarget?.environment] as const,
    apply,
    { immediate: true },
  )

  // Clean up on scope dispose — removes the class so tests/HMR don't leak.
  onScopeDispose(() => {
    stop()
    if (typeof document !== 'undefined') {
      document.body.classList.remove(EDITABLE_PROD_CLASS)
    }
  })
}
