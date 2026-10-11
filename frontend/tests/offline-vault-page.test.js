import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { MemoryRouter } from 'react-router-dom'
import { OFFLINE_RECORD_TYPES } from '../src/offline/offlineStorage.js'

const frontendRoot = fileURLToPath(new URL('..', import.meta.url))
let vite
let OfflineVaultContent

before(async () => {
  vite = await createServer({
    configFile: resolve(frontendRoot, 'vite.config.js'),
    mode: 'test',
    server: { middlewareMode: true },
  })
  ;({ OfflineVaultContent } = await vite.ssrLoadModule('/src/pages/OfflineVaultPage.jsx'))
})

after(async () => {
  await vite?.close()
})

function renderVault(props) {
  return renderToStaticMarkup(createElement(
    MemoryRouter,
    null,
    createElement(OfflineVaultContent, props),
  ))
}

test('renders essential trip snapshot details directly from saved Vault data', () => {
  const savedAt = '2026-10-10T10:00:00.000Z'
  const updatedAt = '2026-10-11T10:00:00.000Z'
  const markup = renderVault({
    records: [{
      recordType: OFFLINE_RECORD_TYPES.TRIP,
      key: 'trip-1',
      savedAt,
      updatedAt,
      data: {
        tripId: 'trip-1',
        destination: 'Goa',
        travel_dates: '2026-11-01 to 2026-11-04',
        itinerary: [{
          day_number: 1,
          theme: 'Coast',
          attractions: [{ place: { name: 'Fort Aguada' } }],
        }],
      },
    }],
    loading: false,
    error: '',
    onRemove: () => {},
  })

  assert.match(markup, /Goa/)
  assert.match(markup, /2026-11-01 to 2026-11-04/)
  assert.match(markup, /Fort Aguada/)
  assert.match(markup, /Saved itinerary/)
  assert.match(markup, /Saved /)
  assert.match(markup, /Updated /)
  assert.match(markup, /1 saved trip/)
  assert.match(markup, /Freshness: Fresh/)
  assert.match(markup, /Trip snapshot: Available offline · no expiry/)
  assert.match(markup, /href="\/trips\/trip-1"/)
})

test('distinguishes stale and unavailable freshness metadata', () => {
  const staleMarkup = renderVault({
    records: [
      {
        recordType: OFFLINE_RECORD_TYPES.TRIP,
        key: 'trip-2',
        tripId: 'trip-2',
        savedAt: '2026-10-01T10:00:00.000Z',
        data: { tripId: 'trip-2', destination: 'Pune' },
      },
      {
        recordType: OFFLINE_RECORD_TYPES.WEATHER,
        key: 'trip-2:weather',
        tripId: 'trip-2',
        savedAt: '2000-01-01T00:00:00.000Z',
        data: { tripId: 'trip-2', weather: { summary: 'Sunny' } },
      },
    ],
    loading: false,
    error: '',
    onRemove: () => {},
    onRefresh: () => {},
  })
  assert.match(staleMarkup, /Freshness: Stale/)
  assert.match(staleMarkup, /Refresh snapshot/)

  const unavailableMarkup = renderVault({
    records: [{
      recordType: OFFLINE_RECORD_TYPES.TRIP,
      key: 'trip-3',
      data: { tripId: 'trip-3', destination: 'Lonavala' },
    }],
    loading: false,
    error: '',
    onRemove: () => {},
    onRefresh: () => {},
  })
  assert.match(unavailableMarkup, /Freshness: Unavailable metadata/)
})

test('renders an empty state when no trip snapshots are stored', () => {
  const markup = renderVault({
    records: [],
    loading: false,
    error: '',
    onRemove: () => {},
  })

  assert.match(markup, /Your vault is empty/)
  assert.match(markup, /Save for Offline/)
})

test('renders incomplete snapshots safely and offers online recovery guidance', () => {
  const markup = renderVault({
    records: [
      {
        recordType: OFFLINE_RECORD_TYPES.TRIP,
        key: 'trip-invalid',
        savedAt: '2026-10-11T10:00:00.000Z',
        data: null,
      },
      {
        recordType: OFFLINE_RECORD_TYPES.TRIP,
        key: 'trip-mismatch',
        savedAt: '2026-10-11T10:00:00.000Z',
        data: { tripId: 'another-trip', destination: 'Pune' },
      },
      null,
      { recordType: OFFLINE_RECORD_TYPES.TRIP, key: 'trip-array', data: [] },
    ],
    loading: false,
    error: '',
    onRemove: () => {},
    onRefresh: () => {},
    isOnline: true,
  })

  assert.match(markup, /3 saved trips/)
  assert.equal((markup.match(/This saved trip is incomplete/g) || []).length, 3)
  assert.equal((markup.match(/Refresh snapshot/g) || []).length, 3)
  assert.match(markup, /Freshness: Fresh/)
  assert.doesNotMatch(markup, /Pune/)
})

test('accepts a minimal trip snapshot without an itinerary', () => {
  const markup = renderVault({
    records: [{
      recordType: OFFLINE_RECORD_TYPES.TRIP,
      key: 'trip-minimal',
      savedAt: '2026-10-11T10:00:00.000Z',
      updatedAt: '2026-10-11T10:00:00.000Z',
      data: { tripId: 'trip-minimal', id: 'trip-minimal' },
    }],
    loading: false,
    error: '',
    onRemove: () => {},
    onRefresh: () => {},
  })

  assert.match(markup, /Untitled destination/)
  assert.match(markup, /Freshness: Fresh/)
  assert.doesNotMatch(markup, /This saved trip is incomplete/)
  assert.doesNotMatch(markup, /Saved itinerary/)
})

test('reports Vault storage failures without presenting them as an empty Vault', () => {
  const markup = renderVault({
    records: [],
    loading: false,
    error: 'IndexedDB is not available in this browser.',
    onRemove: () => {},
  })

  assert.match(markup, /role="alert"/)
  assert.match(markup, /IndexedDB is not available/)
  assert.doesNotMatch(markup, /Your vault is empty/)
})
