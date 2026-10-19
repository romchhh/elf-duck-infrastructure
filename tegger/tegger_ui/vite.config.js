import path from 'path'
import { fileURLToPath } from 'url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

async function createPlugins() {
  const plugins = [react()]

  // Docker/prod builds skip Base44 HMR tooling — not needed for static UI.
  if (process.env.TEGGER_SKIP_BASE44 === '1') {
    return plugins
  }

  try {
    const { default: base44 } = await import('@base44/vite-plugin')
    plugins.unshift(
      base44({
        legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
        hmrNotifier: true,
        navigationNotifier: true,
        analyticsTracker: true,
        visualEditAgent: true,
      })
    )
  } catch (error) {
    console.warn(
      '[tegger] @base44/vite-plugin unavailable, building without it:',
      error?.message || error
    )
  }

  return plugins
}

export default defineConfig(async () => ({
  plugins: await createPlugins(),
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.TEGGER_API_PROXY || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
}))
