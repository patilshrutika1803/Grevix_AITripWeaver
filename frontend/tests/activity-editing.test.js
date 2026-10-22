import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import {
  attractionEditorReducer,
  initialAttractionEditorState,
  validateAttractionDraft,
} from '../src/utils/itineraryActivity.js'

test('saved itineraries expose attraction editing and validate required fields and numeric costs', async () => {
  const server = await createServer({
    configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
    root: fileURLToPath(new URL('..', import.meta.url)),
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
    appType: 'custom',
  })

  try {
    const [{ default: PlanCard }, { MemoryRouter }] = await Promise.all([
      server.ssrLoadModule('/src/components/PlanCard.jsx'),
      import('react-router-dom'),
    ])
    const attraction = {
      place: { name: 'Old museum', description: 'Original description', entry_fee: '₹100' },
      timing: 'Morning',
    }
    const plan = {
      trip_id: 'trip-123',
      preferences: { destination: 'Kyoto' },
      itinerary: [{ day_number: 1, theme: 'Culture', attractions: [attraction] }],
    }
    const savedTripMarkup = renderToStaticMarkup(createElement(
      MemoryRouter,
      null,
      createElement(PlanCard, { plan, onUpdateAttraction: async () => {} }),
    ))
    const unsavedPlanMarkup = renderToStaticMarkup(createElement(
      MemoryRouter,
      null,
      createElement(PlanCard, { plan: { ...plan, trip_id: undefined } }),
    ))

    assert.match(savedTripMarkup, /aria-label="Edit Old museum"/)
    assert.doesNotMatch(unsavedPlanMarkup, /aria-label="Edit Old museum"/)
    assert.equal(validateAttractionDraft({ title: '  ', description: '', time: 'Morning', cost: '10' }), 'Enter an activity title.')
    assert.equal(validateAttractionDraft({ title: 'Museum', description: '', time: ' ', cost: '10' }), 'Enter a time for this activity.')
    assert.match(validateAttractionDraft({ title: 'Museum', description: '', time: 'Morning', cost: '-1' }), /non-negative number/)
    assert.match(validateAttractionDraft({ title: 'Museum', description: '', time: 'Morning', cost: 'nope' }), /non-negative number/)
    assert.equal(validateAttractionDraft({ title: 'Museum', description: '', time: 'Morning', cost: '10.25' }), '')

    const draft = { title: 'Museum', description: 'Details', time: 'Morning', cost: '10' }
    const editing = attractionEditorReducer(initialAttractionEditorState, { type: 'edit', index: 0, draft })
    const failed = attractionEditorReducer(editing, { type: 'saving' })
    const failedWithError = attractionEditorReducer(failed, { type: 'save-failed', error: 'Save failed.' })
    assert.equal(failedWithError.editingIndex, 0)
    assert.deepEqual(failedWithError.draft, draft)
    assert.equal(failedWithError.error, 'Save failed.')
    assert.equal(failedWithError.saving, false)
    assert.deepEqual(
      attractionEditorReducer(failedWithError, { type: 'cancel' }),
      initialAttractionEditorState,
    )
    const saving = attractionEditorReducer(editing, { type: 'saving' })
    assert.deepEqual(attractionEditorReducer(saving, { type: 'cancel' }), saving)
  } finally {
    await server.close()
  }
})

test('activity updates use the authenticated targeted PATCH endpoint and surface save failures', async () => {
  const previous = {
    fetch: globalThis.fetch,
    supabaseUrl: process.env.VITE_SUPABASE_URL,
    supabaseKey: process.env.VITE_SUPABASE_ANON_KEY,
    apiBaseUrl: process.env.VITE_API_BASE_URL,
  }
  process.env.VITE_SUPABASE_URL = 'https://supabase.example.test'
  process.env.VITE_SUPABASE_ANON_KEY = 'public-anon-test-key'
  process.env.VITE_API_BASE_URL = 'https://api.example.test'
  const endpoint = 'https://api.example.test/api/v1/trips/trip-123/days/2/attractions/1'
  const payload = {
    title: 'Updated museum',
    description: 'Updated details',
    time: '10:00 AM',
    cost: 125.5,
  }
  let failSave = false
  let activityCall
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
    if (url === endpoint) {
      activityCall = { url, options }
      return failSave
        ? new Response(JSON.stringify({ detail: 'Trip not found.' }), { status: 404 })
        : new Response(JSON.stringify({
            trip_id: 'trip-123',
            day_number: 2,
            attraction_index: 1,
            attraction: { place: { name: payload.title }, timing: payload.time },
            updated_at: '2026-10-13T00:00:00Z',
          }), { status: 200 })
    }
    return new Response(JSON.stringify({}), { status: 200 })
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

    const result = await tripsApi.updateAttraction('trip-123', 2, 1, payload)
    assert.equal(activityCall.url, endpoint)
    assert.equal(activityCall.options.method, 'PATCH')
    assert.deepEqual(JSON.parse(activityCall.options.body), payload)
    assert.match(activityCall.options.headers.Authorization, /^Bearer /)
    assert.equal(result.attraction.place.name, payload.title)

    failSave = true
    await assert.rejects(
      tripsApi.updateAttraction('trip-123', 2, 1, payload),
      { message: 'Trip not found.' },
    )
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
