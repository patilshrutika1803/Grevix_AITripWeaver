import assert from 'node:assert/strict'
import test from 'node:test'

test('day regeneration sends an authenticated PATCH and reports success and failures', async (t) => {
  const previous = {
    fetch: globalThis.fetch,
    supabaseUrl: process.env.VITE_SUPABASE_URL,
    supabaseKey: process.env.VITE_SUPABASE_ANON_KEY,
    apiBaseUrl: process.env.VITE_API_BASE_URL,
  }
  process.env.VITE_SUPABASE_URL = 'https://supabase.example.test'
  process.env.VITE_SUPABASE_ANON_KEY = 'public-anon-test-key'
  process.env.VITE_API_BASE_URL = 'https://api.example.test'
  const calls = []
  const regeneratedDay = {
    day_number: 2,
    theme: 'Updated culture day',
    hotel: { name: 'Updated hotel' },
    meals: [],
    attractions: [],
    activities: ['Museum visit'],
    transport: { mode: 'Metro' },
    estimated_day_cost: 1200,
  }
  const tripId = 'trip-123'
  const endpoint = `https://api.example.test/api/v1/trips/${tripId}/days/2/regenerate`
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    if (url === 'https://supabase.example.test/auth/v1/user') {
      return new Response(JSON.stringify({
        id: 'supabase-user',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'traveler@example.test',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: new Date().toISOString(),
        identities: [],
      }), { status: 200 })
    }
    if (url === endpoint && options.headers.Authorization) {
      return new Response(JSON.stringify({
        trip_id: tripId,
        day_number: 2,
        regenerated_day: regeneratedDay,
        updated_at: '2026-10-13T00:00:00Z',
      }), { status: 200 })
    }
    return new Response(JSON.stringify({ detail: 'Unable to generate the travel plan at this time. Please try again.' }), { status: 500 })
  }

  try {
    const { tripsApi } = await import('../src/api/client.js')
    const { getSupabaseClient } = await import('../src/auth/supabase.js')
    const accessToken = [
      Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ sub: 'supabase-user', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
      'test-signature',
    ].join('.')
    const { error } = await getSupabaseClient().auth.setSession({
      access_token: accessToken,
      refresh_token: 'test-refresh-token',
    })
    assert.equal(error, null)

    await t.test('targets the saved trip and selected day with authentication', async () => {
      const result = await tripsApi.regenerateDay(tripId, 2)
      const call = calls.find(({ url }) => url === endpoint)
      assert.equal(call.options.method, 'PATCH')
      assert.equal(call.options.body, undefined)
      assert.ok(call.options.signal instanceof AbortSignal)
      assert.match(call.options.headers.Authorization, /^Bearer /)
      assert.equal(result.trip_id, tripId)
      assert.equal(result.day_number, 2)
      assert.deepEqual(result.regenerated_day, regeneratedDay)
    })

    await t.test('surfaces backend agent errors', async () => {
      const originalFetch = globalThis.fetch
      globalThis.fetch = async (url, options) => {
        if (url === 'https://supabase.example.test/auth/v1/user') {
          return originalFetch(url, options)
        }
        return new Response(JSON.stringify({ detail: 'Unable to generate the travel plan at this time. Please try again.' }), { status: 500 })
      }
      try {
        await assert.rejects(
          tripsApi.regenerateDay(tripId, 2),
          { message: 'Unable to generate the travel plan at this time. Please try again.' },
        )
      } finally {
        globalThis.fetch = originalFetch
      }
    })

    await t.test('turns request timeouts into a clear user-facing error', async () => {
      const originalFetch = globalThis.fetch
      globalThis.fetch = async (url, options) => {
        if (url === 'https://supabase.example.test/auth/v1/user') {
          return originalFetch(url, options)
        }
        throw new DOMException('The operation timed out.', 'TimeoutError')
      }
      try {
        await assert.rejects(
          tripsApi.regenerateDay(tripId, 2),
          { message: 'Day regeneration timed out. Refresh the trip before trying again.' },
        )
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  } finally {
    globalThis.fetch = previous.fetch
    if (previous.supabaseUrl === undefined) delete process.env.VITE_SUPABASE_URL
    else process.env.VITE_SUPABASE_URL = previous.supabaseUrl
    if (previous.supabaseKey === undefined) delete process.env.VITE_SUPABASE_ANON_KEY
    else process.env.VITE_SUPABASE_ANON_KEY = previous.supabaseKey
    if (previous.apiBaseUrl === undefined) delete process.env.VITE_API_BASE_URL
    else process.env.VITE_API_BASE_URL = previous.apiBaseUrl
  }
})
