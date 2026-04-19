<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useLocaleStore } from '../stores/locale.js'

const route = useRoute()
const router = useRouter()
const locale = useLocaleStore()

const currentLabel = computed(() => locale.activeLocale?.toUpperCase() ?? locale.defaultLocale?.toUpperCase() ?? 'EN')

function switchLocale(loc: string) {
  const isDefault = loc === locale.defaultLocale
  const current = route.query
  if (isDefault) {
    // Remove ?locale= for default
    const { locale: _, ...rest } = current
    router.push({ query: rest })
  } else {
    router.push({ query: { ...current, locale: loc } })
  }
}
</script>

<template>
  <div v-if="locale.isEnabled" class="locale-picker" data-testid="locale-picker">
    <button
      v-for="loc in locale.siteLocales"
      :key="loc"
      :class="['locale-btn', { active: (locale.activeLocale ?? locale.defaultLocale) === loc }]"
      :data-testid="`locale-${loc}`"
      @click="switchLocale(loc)"
    >{{ loc.toUpperCase() }}</button>
  </div>
</template>

<style scoped>
.locale-picker { display: flex; gap: 2px; align-items: center; margin-left: 0.5rem; }
.locale-btn {
  background: none; border: 1px solid var(--color-border); color: var(--color-muted);
  font-size: 0.625rem; font-weight: 700; letter-spacing: 0.05em;
  padding: 0.125rem 0.375rem; border-radius: 3px; cursor: pointer;
  transition: all 0.15s;
}
.locale-btn:hover { color: var(--color-fg); border-color: var(--color-fg); }
.locale-btn.active { color: var(--color-primary); border-color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 10%, transparent); }
</style>
