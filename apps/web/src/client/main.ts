import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import App from './App.vue'
import { createRouter } from './router.js'

const app = createApp(App)
app.use(createPinia())
app.use(PrimeVue, { theme: { preset: Aura } })
app.use(createRouter())
app.mount('#app')
