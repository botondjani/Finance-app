import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ command }) => ({
  // GitHub Pages serves the app from /Finance-app/
  base: command === 'build' ? '/Finance-app/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Pénzügyek', short_name: 'Pénzügyek', lang: 'hu', display: 'standalone',
        theme_color: '#2a78d6', background_color: '#f6f7f9',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: { maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 },
    }),
  ],
}))
