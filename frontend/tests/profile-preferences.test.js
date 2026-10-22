import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const savedPreferences = {
  id: 'user-123:preferences',
  user_id: 'user-123',
  travel_style: 'Balanced',
  interests: ['Beach', 'Culture'],
  things_to_avoid: [],
  budget_preference: 'Moderate',
  hotel_preference: 'Boutique',
  food_preference: 'Local',
  preferred_destinations: ['Kyoto', 'Goa'],
  preferred_budget_min: null,
  preferred_budget_max: null,
  preferred_currency: 'INR',
  preferred_trip_duration: null,
  is_domestic: null,
  updated_at: null,
}

test('profile immediately renders saved backend preferences in its normal view', async () => {
  const server = await createServer({
    configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
    root: fileURLToPath(new URL('..', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
    appType: 'custom',
  })

  try {
    const [
      { default: ProfilePage, ProfilePreferences },
      { AuthContext },
      { PreferencesContext },
      { MemoryRouter },
    ] = await Promise.all([
      server.ssrLoadModule('/src/pages/ProfilePage.jsx'),
      server.ssrLoadModule('/src/auth/context.js'),
      server.ssrLoadModule('/src/preferences/context.js'),
      import('react-router-dom'),
    ])

    const profile = renderToStaticMarkup(createElement(
      MemoryRouter,
      null,
      createElement(AuthContext.Provider, {
        value: { user: { id: 'user-123', name: 'Traveler', email: 'traveler@example.test' }, logout() {} },
      }, createElement(PreferencesContext.Provider, {
        value: { preferences: savedPreferences, setPreferences() {} },
      }, createElement(ProfilePage))),
    ))

    assert.match(profile, /<h1>Profile<\/h1>/)
    assert.match(profile, /<strong>Balanced<\/strong>/)
    assert.match(profile, /<strong>Moderate<\/strong>/)
    assert.match(profile, /<strong>Kyoto, Goa<\/strong>/)
    assert.match(profile, /<strong>Beach, Culture<\/strong>/)
    assert.match(profile, /href="\/preferences"/)
    assert.doesNotMatch(profile, /Flexible|Food, culture, nature|Add destinations/)

    const missing = renderToStaticMarkup(createElement(
      MemoryRouter,
      null,
      createElement(ProfilePreferences, {
        preferences: { travel_style: null, interests: [], budget_preference: null, preferred_destinations: [] },
        loading: false,
        error: '',
      }),
    ))
    assert.equal((missing.match(/Not set yet/g) || []).length, 4)

    const loading = renderToStaticMarkup(createElement(
      MemoryRouter,
      null,
      createElement(ProfilePreferences, { preferences: null, loading: true, error: '' }),
    ))
    assert.match(loading, /role="status">Loading saved preferences/)

    const failed = renderToStaticMarkup(createElement(
      MemoryRouter,
      null,
      createElement(ProfilePreferences, {
        preferences: null,
        loading: false,
        error: 'Unable to load your saved preferences. Please try again.',
      }),
    ))
    assert.match(failed, /role="alert">Unable to load your saved preferences/)
    assert.doesNotMatch(failed, /Not set yet/)
  } finally {
    await server.close()
  }
})

test('preferences API returns saved fields in the backend response shape and fetches them again', async () => {
  const previous = {
    fetch: globalThis.fetch,
    supabaseUrl: process.env.VITE_SUPABASE_URL,
    supabaseKey: process.env.VITE_SUPABASE_ANON_KEY,
    apiBaseUrl: process.env.VITE_API_BASE_URL,
  }
  process.env.VITE_SUPABASE_URL = 'https://supabase.example.test'
  process.env.VITE_SUPABASE_ANON_KEY = 'public-anon-test-key'
  process.env.VITE_API_BASE_URL = 'https://api.example.test'
  const endpoint = 'https://api.example.test/api/v1/users/me/preferences'
  let stored = { ...savedPreferences }
  let failGet = false
  globalThis.fetch = async (url, options) => {
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
    if (url === endpoint && options.method === 'PATCH') {
      stored = { ...stored, ...JSON.parse(options.body) }
      return new Response(JSON.stringify(stored), { status: 200 })
    }
    if (url === endpoint && failGet) {
      return new Response(JSON.stringify({ detail: 'Preferences service unavailable.' }), { status: 503 })
    }
    if (url === endpoint) return new Response(JSON.stringify(stored), { status: 200 })
    return new Response(JSON.stringify({}), { status: 200 })
  }

  try {
    const { preferencesApi } = await import('../src/api/client.js')
    const { savePreferences } = await import('../src/preferences/service.js')
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

    const firstFetch = await preferencesApi.get()
    assert.deepEqual(firstFetch, savedPreferences)

    let visiblePreferences = firstFetch
    const updated = await savePreferences({
      travel_style: 'Adventure',
      interests: ['Nature'],
      budget_preference: 'Luxury',
      preferred_destinations: ['Rajasthan'],
    }, (preferences) => { visiblePreferences = preferences })
    assert.equal(updated.travel_style, 'Adventure')
    assert.equal(visiblePreferences, updated)
    assert.deepEqual(updated.interests, ['Nature'])
    assert.equal(updated.budget_preference, 'Luxury')
    assert.deepEqual(updated.preferred_destinations, ['Rajasthan'])

    const server = await createServer({
      configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
      root: fileURLToPath(new URL('..', import.meta.url)),
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { middlewareMode: true },
      appType: 'custom',
    })
    try {
      const [{ ProfilePreferences }, { MemoryRouter }] = await Promise.all([
        server.ssrLoadModule('/src/pages/ProfilePage.jsx'),
        import('react-router-dom'),
      ])
      const updatedProfile = renderToStaticMarkup(createElement(
        MemoryRouter,
        null,
        createElement(ProfilePreferences, { preferences: visiblePreferences, loading: false, error: '' }),
      ))
      assert.match(updatedProfile, /<strong>Adventure<\/strong>/)
      assert.match(updatedProfile, /<strong>Luxury<\/strong>/)
      assert.match(updatedProfile, /<strong>Rajasthan<\/strong>/)
      assert.match(updatedProfile, /<strong>Nature<\/strong>/)
    } finally {
      await server.close()
    }

    const fetchedAgain = await preferencesApi.get()
    assert.deepEqual(fetchedAgain, updated)

    failGet = true
    await assert.rejects(preferencesApi.get(), { message: 'Preferences service unavailable.' })
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
