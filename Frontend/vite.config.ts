import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('three') || id.includes('@react-three') || id.includes('postprocessing')) {
            return 'vendor-three'
          }
          if (id.includes('recharts') || id.includes('/d3-')) {
            return 'vendor-charts'
          }
          if (id.includes('framer-motion')) {
            return 'vendor-motion'
          }
          if (
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react-router') ||
            id.includes('node_modules/react/')
          ) {
            return 'vendor-react'
          }
        },
      },
    },
  },
})
