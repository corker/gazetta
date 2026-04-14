import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useToastStore = defineStore('toast', () => {
  const current = ref<{ message: string; type: 'success' | 'error'; link?: string } | null>(null)
  // Track the active timer so dismiss() can cancel it cleanly
  let timer: ReturnType<typeof setTimeout> | null = null

  function dismiss() {
    if (timer) { clearTimeout(timer); timer = null }
    current.value = null
  }

  function show(message: string, opts?: { type?: 'success' | 'error'; link?: string; duration?: number }) {
    const type = opts?.type ?? 'success'
    if (timer) { clearTimeout(timer); timer = null }
    current.value = { message, type, link: opts?.link }
    // Errors stay until the user dismisses them — they need to be readable
    // long enough to act on. Successes auto-dismiss.
    const explicit = opts?.duration
    const duration = explicit ?? (type === 'error' ? 0 : 3000)
    if (duration > 0) timer = setTimeout(() => { current.value = null; timer = null }, duration)
  }

  function showError(err: unknown, fallback: string) {
    const message = err instanceof Error ? err.message : fallback
    const friendly = message
      .replace(/^Request failed: (\d+)$/, 'Server error ($1)')
      .replace(/^Failed to fetch$/, 'Cannot connect to server')
    show(friendly, { type: 'error' })
  }

  return { current, show, showError, dismiss }
})
