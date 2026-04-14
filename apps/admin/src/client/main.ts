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
