import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Aura from '@primeuix/themes/aura'
import App from './App.vue'
import { createRouter } from './router.js'
import './assets/tokens.css'

const app = createApp(App)
app.use(createPinia())
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: { darkModeSelector: '.dark' },
  },
})
app.use(createRouter())
app.mount('#app')

// User theme — append AFTER PrimeVue and tokens.css so user declarations
// win the cascade. PrimeVue injects styles at runtime via app.use(PrimeVue),
// so a static <link> in index.html would lose to it. The server returns an
// empty stylesheet when the user has no admin/theme.css, so no onerror
// handling needed.
{
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = '/admin/theme.css'
  document.head.appendChild(link)
}
