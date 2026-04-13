import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  root: '.',
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('"use client"')) return
        warn(warning)
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/vue/') || id.includes('node_modules/vue-router/') || id.includes('node_modules/pinia/')) return 'vendor-vue'
          if (id.includes('node_modules/primevue/') || id.includes('node_modules/@primevue/')) return 'vendor-primevue'
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) return 'vendor-react'
          if (id.includes('node_modules/@rjsf/') || id.includes('node_modules/ajv')) return 'vendor-rjsf'
          if (id.includes('node_modules/@tiptap/') || id.includes('node_modules/prosemirror') || id.includes('node_modules/@prosemirror/')) return 'vendor-tiptap'
        },
      },
    },
  },
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
