import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Inline action attached to a toast — rendered as a button next to the
 * message. Used for e.g. "back to pages/pricing on local" when an item-
 * missing banner fires during target switch. Keep the handler side-effect-
 * free from the toast's POV: the toast auto-dismisses after the handler
 * runs (unless it throws).
 */
export interface ToastAction {
  label: string
  handler: () => void | Promise<void>
}

export const useToastStore = defineStore('toast', () => {
  const current = ref<{
    message: string
    type: 'success' | 'error' | 'info'
    link?: string
    action?: ToastAction
  } | null>(null)
  // Track the active timer so dismiss() can cancel it cleanly
  let timer: ReturnType<typeof setTimeout> | null = null

  function dismiss() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    current.value = null
  }

  function show(
    message: string,
    opts?: {
      type?: 'success' | 'error' | 'info'
      link?: string
      action?: ToastAction
      duration?: number
    },
  ) {
    const type = opts?.type ?? 'success'
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    current.value = { message, type, link: opts?.link, action: opts?.action }
    // Errors stay until the user dismisses them — they need to be readable
    // long enough to act on. Successes auto-dismiss. Info is transient but
    // longer than success so the user has time to act on any attached action.
    //
    // Toasts with an action (Undo, back-to-previous-target) get a longer
    // window too: the user needs time to notice the affordance before it
    // disappears.
    const explicit = opts?.duration
    const hasAction = !!opts?.action
    const defaultDuration = type === 'error' ? 0 : type === 'info' ? 6000 : hasAction ? 6000 : 3000
    const duration = explicit ?? defaultDuration
    if (duration > 0)
      timer = setTimeout(() => {
        current.value = null
        timer = null
      }, duration)
  }

  function showError(err: unknown, fallback: string) {
    const message = err instanceof Error ? err.message : fallback
    const friendly = message
      .replace(/^Request failed: (\d+)$/, 'Server error ($1)')
      .replace(/^Failed to fetch$/, 'Cannot connect to server')
    show(friendly, { type: 'error' })
  }

  /**
   * Run the active toast's action. The handler typically shows a
   * follow-up toast ("Undone", "Restored") — which `show` installs as
   * the new `current`. We DON'T dismiss on our own: the follow-up
   * toast's own lifecycle (success auto-dismiss, error sticky) decides
   * visibility from there. Dismissing here would race with the follow-
   * up's show and clear it immediately.
   *
   * If the handler throws, it's expected to call `toast.showError` in
   * its own catch — no further work to do here.
   */
  async function runAction() {
    const action = current.value?.action
    if (!action) return
    await action.handler()
  }

  return { current, show, showError, dismiss, runAction }
})
