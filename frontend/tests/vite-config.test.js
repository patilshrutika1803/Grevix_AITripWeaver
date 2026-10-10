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
  const rootEnvironment = loadEnv('test', repositoryRoot, 'SUPABASE_URL')

  assert.equal(config.root, frontendRoot)
  assert.equal(config.envDir, repositoryRoot)
  assert.deepEqual(Object.keys(config.define), ['import.meta.env.VITE_SUPABASE_URL'])
  assert.equal(
    config.define['import.meta.env.VITE_SUPABASE_URL'] === JSON.stringify(rootEnvironment.SUPABASE_URL || ''),
    true,
  )
})
