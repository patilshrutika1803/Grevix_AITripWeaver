import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const frontendRoot = fileURLToPath(new URL('.', import.meta.url))
const repositoryRoot = resolve(frontendRoot, '..')

export default defineConfig(({ mode }) => {
  const publicEnvironment = loadEnv(mode, repositoryRoot, ['VITE_SUPABASE_URL', 'SUPABASE_URL'])

  return {
    root: frontendRoot,
    envDir: repositoryRoot,
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
        publicEnvironment.VITE_SUPABASE_URL || publicEnvironment.SUPABASE_URL || '',
      ),
    },
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/health': {
          target: 'http://127.0.0.1:8001',
          changeOrigin: true,
        },
        '/plan': {
          target: 'http://127.0.0.1:8001',
          changeOrigin: true,
          bypass: (request) => request.method === 'GET' && request.url === '/plan' ? '/index.html' : undefined,
        },
        '/api/v1': {
          target: 'http://127.0.0.1:8001',
          changeOrigin: true,
        },
      },
    },
  }
})
