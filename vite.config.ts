import { defineConfig } from 'vite'
import type { ProxyOptions } from 'vite'
import vue from '@vitejs/plugin-vue'

const allowedHosts = ['.ngrok-free.app']
const socketServerUrl = 'http://localhost:3000'

const socketProxy: Record<string, ProxyOptions> = {
  '/socket.io': {
    target: socketServerUrl,
    changeOrigin: true,
    rewriteWsOrigin: true,
    ws: true,
    configure(proxy) {
      proxy.on('proxyReq', (proxyReq) => {
        proxyReq.setHeader('origin', socketServerUrl)
      })
    },
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: './', // Use relative paths for assets
  build: {
    assetsDir: 'assets', // Keep assets organized
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts,
    proxy: socketProxy,
  },
  preview: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts,
    proxy: socketProxy,
  },
})
