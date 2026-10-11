import assert from 'node:assert/strict'
import test from 'node:test'
import { getAuthRedirectUrl } from '../src/auth/redirects.js'

test('auth redirects use the active local frontend origin during development', () => {
  assert.equal(
    getAuthRedirectUrl('/auth/callback', 'http://localhost:5173', false),
    'http://localhost:5173/auth/callback',
  )
})

test('auth redirects use the deployed frontend origin in production', () => {
  assert.equal(
    getAuthRedirectUrl('/auth/callback', 'http://localhost:5173', true),
    'https://grevix-ai-trip-weaver.vercel.app/auth/callback',
  )
})
