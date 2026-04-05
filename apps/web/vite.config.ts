import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  root: '.',
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
      '/preview': 'http://localhost:4000',
    },
  },
})
