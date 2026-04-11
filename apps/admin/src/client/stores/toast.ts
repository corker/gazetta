import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useToastStore = defineStore('toast', () => {
  const current = ref<{ message: string; type: 'success' | 'error'; link?: string } | null>(null)

  function show(message: string, opts?: { type?: 'success' | 'error'; link?: string; duration?: number }) {
    const type = opts?.type ?? 'success'
    current.value = { message, type, link: opts?.link }
    setTimeout(() => { current.value = null }, opts?.duration ?? 3000)
  }

  function showError(err: unknown, fallback: string) {
    const message = err instanceof Error ? err.message : fallback
    const friendly = message
      .replace(/^Request failed: (\d+)$/, 'Server error ($1)')
      .replace(/^Failed to fetch$/, 'Cannot connect to server')
    show(friendly, { type: 'error' })
  }

  return { current, show, showError }
})
