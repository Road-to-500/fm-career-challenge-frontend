import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { loadEnv } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const apiTarget = env.API_PROXY_TARGET || 'http://localhost:5195'
  return {
    plugins: [vue(), tailwindcss()],
    server: {
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/hubs': {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    test: {
      exclude: [...configDefaults.exclude, 'e2e/**'],
      environment: 'jsdom',
      restoreMocks: true,
    },
  }
})
