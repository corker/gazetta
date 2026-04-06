import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  root: '.',
  server: {
    hmr: {
      // When proxied through gazetta dev, tell the browser to connect HMR websocket to Vite's actual port
      clientPort: parseInt(process.env.VITE_HMR_PORT ?? '0', 10) || undefined,
    },
    proxy: {
      '/api': `http://localhost:${process.env.API_PORT ?? '4000'}`,
      '/preview': `http://localhost:${process.env.API_PORT ?? '4000'}`,
    },
  },
})
