import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Vercel serves the SPA entry point for direct application routes', async () => {
  const configuration = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))

  assert.deepEqual(configuration.rewrites, [
    { source: '/(.*)', destination: '/index.html' },
  ])
})
