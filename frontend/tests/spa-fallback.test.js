import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Vercel serves the SPA entry point for direct application routes', async () => {
  const configuration = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
  const [rewrite] = configuration.rewrites

  assert.equal(configuration.rewrites.length, 1)
  assert.equal(rewrite.destination, '/index.html')

  const matchesRewrite = new RegExp(`^${rewrite.source}$`)
  for (const route of ['/', '/trips', '/auth/callback', '/offline-vault']) {
    assert.match(route, matchesRewrite)
  }
  for (const path of ['/api/v1/trips', '/health/ready', '/plan/stream', '/assets/app.js', '/manifest.webmanifest']) {
    assert.doesNotMatch(path, matchesRewrite)
  }
})
