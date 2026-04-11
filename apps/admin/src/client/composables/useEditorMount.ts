import { watch, onBeforeUnmount, type Ref } from 'vue'
import type { EditorMount } from 'gazetta/types'

export function useEditorMount(
  containerRef: Ref<HTMLElement | null>,
  editorMount: Ref<EditorMount | null>,
  content: Ref<Record<string, unknown> | null>,
  schema: Ref<Record<string, unknown> | null>,
  theme: Ref<'dark' | 'light'>,
  onChange: (content: Record<string, unknown>) => void,
  mountVersion?: Ref<number>
) {
  let mounted = false

  function mount() {
    if (!containerRef.value || !editorMount.value || !content.value || !schema.value) return
    if (mounted) unmount()
    editorMount.value.mount(containerRef.value, {
      content: content.value,
      schema: schema.value,
      theme: theme.value,
      onChange,
    })
    mounted = true
  }

  function unmount() {
    if (!mounted || !containerRef.value || !editorMount.value) return
    editorMount.value.unmount(containerRef.value)
    mounted = false
  }

  // Re-mount when container, editor instance, or mountVersion changes.
  // mountVersion bumps on open/discard — not on every keystroke.
  // Content updates from editing flow through React's internal state via onChange.
  const deps = mountVersion
    ? [containerRef, editorMount, mountVersion] as const
    : [containerRef, editorMount] as const

  watch(deps, () => {
    if (containerRef.value && editorMount.value && content.value) mount()
    else unmount()
  }, { immediate: true })

  onBeforeUnmount(unmount)
}
