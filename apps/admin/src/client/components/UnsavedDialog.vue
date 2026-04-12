<script setup lang="ts">
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { useUnsavedGuardStore } from '../stores/unsavedGuard.js'

const guard = useUnsavedGuardStore()
</script>

<template>
  <Dialog :visible="guard.visible" modal header="Unsaved Changes" :closable="false"
    :style="{ width: '24rem' }" :pt="{ mask: { style: 'backdrop-filter: blur(2px)' } }">
    <p class="unsaved-message">You have unsaved changes. What would you like to do?</p>
    <template #footer>
      <div class="unsaved-actions">
        <Button label="Cancel" severity="secondary" text @click="guard.respond('cancel')" />
        <Button label="Discard" severity="danger" text @click="guard.respond('discard')" />
        <Button label="Save" icon="pi pi-check" @click="guard.respond('save')" />
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.unsaved-message { font-size: 0.875rem; color: #4b5563; line-height: 1.5; }
:global(.dark) .unsaved-message { color: #a1a1aa; }
.unsaved-actions { display: flex; gap: 0.5rem; justify-content: flex-end; width: 100%; }
</style>
