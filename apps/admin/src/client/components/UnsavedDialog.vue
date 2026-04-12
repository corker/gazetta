<script setup lang="ts">
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { useUnsavedGuardStore } from '../stores/unsavedGuard.js'
import { useEditingStore } from '../stores/editing.js'

const guard = useUnsavedGuardStore()
const editing = useEditingStore()

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') guard.respond('cancel')
}
</script>

<template>
  <Dialog :visible="guard.visible" modal header="Unsaved Changes" :closable="false"
    :style="{ width: '26rem' }" :pt="{ mask: { style: 'backdrop-filter: blur(2px)' } }"
    @keydown="onKeydown">
    <p class="unsaved-message">
      You have unsaved changes to <strong>{{ editing.template }}</strong>.
    </p>
    <p class="unsaved-hint">Your changes will be lost if you don't save them.</p>
    <template #footer>
      <div class="unsaved-actions">
        <Button label="Don't Save" severity="danger" text @click="guard.respond('discard')" />
        <Button label="Cancel" severity="secondary" text @click="guard.respond('cancel')" />
        <Button label="Save" icon="pi pi-check" autofocus @click="guard.respond('save')" />
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.unsaved-message { font-size: 0.875rem; color: #374151; line-height: 1.5; margin: 0; }
.unsaved-hint { font-size: 0.8125rem; color: #6b7280; margin-top: 0.375rem; }
:global(.dark) .unsaved-message { color: #e4e4e7; }
:global(.dark) .unsaved-hint { color: #71717a; }
.unsaved-actions { display: flex; gap: 0.5rem; justify-content: flex-end; width: 100%; }
</style>
