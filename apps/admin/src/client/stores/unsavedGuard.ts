import { defineStore } from 'pinia'
import { ref } from 'vue'

export type GuardResult = 'save' | 'discard' | 'cancel'

export const useUnsavedGuardStore = defineStore('unsavedGuard', () => {
  const visible = ref(false)
  let pending: { resolve: (result: GuardResult) => void } | null = null

  function guard(): Promise<GuardResult> {
    if (pending) return new Promise(r => r('cancel'))
    visible.value = true
    return new Promise<GuardResult>(resolve => {
      pending = { resolve }
    })
  }

  function respond(result: GuardResult) {
    visible.value = false
    pending?.resolve(result)
    pending = null
  }

  return { visible, guard, respond }
})
