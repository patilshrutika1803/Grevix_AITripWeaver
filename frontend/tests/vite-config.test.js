import assert from 'node:assert/strict'
import test from 'node:test'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import viteConfig from '../vite.config.js'

test('Vite loads root environment and exposes only the public Supabase URL alias', () => {
  const frontendRoot = fileURLToPath(new URL('..', import.meta.url))
  const repositoryRoot = resolve(frontendRoot, '..')
  const config = viteConfig({ mode: 'test' })
  const rootEnvironment = loadEnv('test', repositoryRoot, ['VITE_SUPABASE_URL', 'SUPABASE_URL'])

  assert.equal(config.root, frontendRoot)
  assert.equal(config.envDir, repositoryRoot)
  assert.deepEqual(Object.keys(config.define), ['import.meta.env.VITE_SUPABASE_URL'])
  assert.equal(
    config.define['import.meta.env.VITE_SUPABASE_URL'] === JSON.stringify(
      rootEnvironment.VITE_SUPABASE_URL || rootEnvironment.SUPABASE_URL || '',
    ),
    true,
  )
})

test('Vite prefers the documented frontend Supabase URL environment variable', () => {
  const originalUrl = process.env.VITE_SUPABASE_URL
  process.env.VITE_SUPABASE_URL = 'https://public.example.supabase.co'

  try {
    const config = viteConfig({ mode: 'test' })
    assert.equal(
      config.define['import.meta.env.VITE_SUPABASE_URL'],
      JSON.stringify('https://public.example.supabase.co'),
    )
  } finally {
    if (originalUrl === undefined) delete process.env.VITE_SUPABASE_URL
    else process.env.VITE_SUPABASE_URL = originalUrl
  }
})

test('Vite proxies local API requests to the available backend port', () => {
  const config = viteConfig({ mode: 'test' })

  assert.equal(config.server.proxy['/health'].target, 'http://127.0.0.1:8001')
  assert.equal(config.server.proxy['/plan'].target, 'http://127.0.0.1:8001')
  assert.equal(config.server.proxy['/api/v1'].target, 'http://127.0.0.1:8001')
})
