import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  root: '.',
  server: {
    proxy: {
      '/api': `http://localhost:${process.env.API_PORT ?? '4000'}`,
      '/preview': `http://localhost:${process.env.API_PORT ?? '4000'}`,
    },
  },
})
