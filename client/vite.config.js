import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Force new SW to activate immediately (no stale cache)
        skipWaiting: true,
        clientsClaim: true,
        // Cache all static assets (JS, CSS, images, fonts)
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Cache API responses for offline use
        // NOTE: do NOT add a catch-all NetworkOnly rule for /api/* —
        // Workbox short-circuits with a network error when navigator.onLine === false,
        // even though the local server (localhost:5000) is still reachable.
        // Letting unmatched /api/* requests bypass the SW means the browser fetches
        // directly, which works on localhost even when the OS reports "offline".
        runtimeCaching: [
          {
            urlPattern: /^\/api\/(products|categories|settings|users)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-data',
              expiration: { maxEntries: 100, maxAgeSeconds: 86400 },
              networkTimeoutSeconds: 3,
            },
          },
        ],
      },
      manifest: false, // use existing public/manifest.json
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts'],
          'vendor-ui': ['lucide-react', '@radix-ui/react-dialog', '@radix-ui/react-select'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
      },
    },
  },
})
