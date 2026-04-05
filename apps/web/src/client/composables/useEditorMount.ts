import { watch, onBeforeUnmount, type Ref } from 'vue'
import type { EditorMount } from '@gazetta/core'

export function useEditorMount(
  containerRef: Ref<HTMLElement | null>,
  editorMount: Ref<EditorMount | null>,
  content: Ref<Record<string, unknown> | null>,
  onChange: (content: Record<string, unknown>) => void
) {
  let mounted = false

  function mount() {
    if (!containerRef.value || !editorMount.value || !content.value) return
    if (mounted) unmount()
    editorMount.value.mount(containerRef.value, { content: content.value, onChange })
    mounted = true
  }

  function unmount() {
    if (!mounted || !containerRef.value || !editorMount.value) return
    editorMount.value.unmount(containerRef.value)
    mounted = false
  }

  watch([containerRef, editorMount, content], () => {
    if (containerRef.value && editorMount.value && content.value) mount()
    else unmount()
  }, { immediate: true })

  onBeforeUnmount(unmount)
}
