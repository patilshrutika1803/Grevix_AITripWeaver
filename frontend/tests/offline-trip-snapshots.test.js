import assert from 'node:assert/strict'
import test from 'node:test'
import { OFFLINE_RECORD_TYPES } from '../src/offline/offlineStorage.js'
import {
  buildTripOfflineSnapshots,
  deleteTripOffline,
  isValidTripSnapshot,
  saveTripOffline,
} from '../src/offline/offlineTripSnapshots.js'

function createMemoryStorage(initialRecords = []) {
  const records = new Map(initialRecords.map((record) => [
    `${record.recordType}:${record.key}`,
    record,
  ]))
  return {
    records,
    saveOfflineRecord: async (recordType, key, data) => {
      const record = { recordType, key, tripId: data.tripId, data }
      records.set(`${recordType}:${key}`, record)
      return record
    },
    listOfflineRecords: async (recordType) => [...records.values()]
      .filter((record) => record.recordType === recordType),
    deleteOfflineRecord: async (recordType, key) => records.delete(`${recordType}:${key}`),
  }
}

test('validates snapshot identity without requiring optional itinerary data', () => {
  assert.equal(isValidTripSnapshot({ tripId: 'trip-1', id: 'trip-1' }, 'trip-1'), true)
  assert.equal(isValidTripSnapshot({ tripId: 'trip-1' }, 'trip-1'), true)
  assert.equal(isValidTripSnapshot({ id: 'trip-1' }, 'trip-1'), true)
  assert.equal(isValidTripSnapshot({ tripId: 'trip-1', itinerary: [] }, 'trip-1'), true)
})

test('rejects malformed snapshots and conflicting or mismatched trip identifiers', () => {
  assert.equal(isValidTripSnapshot(null, 'trip-1'), false)
  assert.equal(isValidTripSnapshot([], 'trip-1'), false)
  assert.equal(isValidTripSnapshot({ destination: 'Goa' }, 'trip-1'), false)
  assert.equal(isValidTripSnapshot({ tripId: 'trip-2' }, 'trip-1'), false)
  assert.equal(isValidTripSnapshot({ tripId: 'trip-1', id: 'trip-2' }, 'trip-1'), false)
})

test('builds trip, weather, and place snapshots only from present trip data', () => {
  const trip = {
    id: 'trip-1',
    destination: 'Goa',
    travel_dates: '2026-11-01 to 2026-11-04',
    duration: 3,
    total_budget: 25000,
    budget_currency: 'INR',
    budget_breakdown: { total_estimated: 23000, currency: 'INR', categories: [] },
    weather: { summary: 'Warm and sunny', conditions: 'Sunny' },
    itinerary: [{
      day_number: 1,
      theme: 'Coast',
      attractions: [{ place: { name: 'Fort Aguada', latitude: 15.49, longitude: 73.77 } }],
    }],
  }

  const snapshots = buildTripOfflineSnapshots(trip)
  assert.deepEqual(snapshots.map(({ recordType }) => recordType), [
    OFFLINE_RECORD_TYPES.TRIP,
    OFFLINE_RECORD_TYPES.WEATHER,
    OFFLINE_RECORD_TYPES.PLACE,
  ])
  assert.equal(snapshots[0].data.travel_dates, trip.travel_dates)
  assert.deepEqual(snapshots[0].data.budget_breakdown, trip.budget_breakdown)
  assert.deepEqual(snapshots[0].data.itinerary, trip.itinerary)
  assert.deepEqual(snapshots[0].data.weather, trip.weather)
  assert.deepEqual(snapshots[1].data.weather, trip.weather)
  assert.equal(snapshots[2].data.places[0].place.name, 'Fort Aguada')
})

test('omits empty auxiliary data and saves the trip without another data source', async () => {
  const trip = {
    id: 'trip-2',
    destination: 'Pune',
    weather: null,
    itinerary: [{ day_number: 1, attractions: [] }],
  }
  const storage = createMemoryStorage()
  const savedTrip = await saveTripOffline(trip, storage)

  assert.deepEqual([...storage.records.values()].map(({ recordType }) => recordType), [
    OFFLINE_RECORD_TYPES.TRIP,
  ])
  assert.equal(savedTrip.key, 'trip-2')
  assert.throws(
    () => buildTripOfflineSnapshots({ ...trip, id: '' }),
    /trip with an ID is required/,
  )
  assert.equal(savedTrip.data.destination, 'Pune')
  assert.equal(Object.hasOwn(savedTrip.data, 'travel_dates'), false)
})

test('deletes a trip and only auxiliary snapshots associated with its ID', async () => {
  const storage = createMemoryStorage([
    { recordType: OFFLINE_RECORD_TYPES.TRIP, key: 'trip-3', tripId: 'trip-3' },
    { recordType: OFFLINE_RECORD_TYPES.WEATHER, key: 'trip-3:weather', tripId: 'trip-3' },
    { recordType: OFFLINE_RECORD_TYPES.PLACE, key: 'other:places', tripId: 'other' },
  ])
  await deleteTripOffline('trip-3', storage)

  assert.deepEqual([...storage.records.values()].map(({ key }) => key), ['other:places'])
})

test('reports IndexedDB/storage failures to callers', async () => {
  await assert.rejects(
    saveTripOffline({ id: 'trip-4' }, {
      saveOfflineRecord: async () => { throw new Error('IndexedDB unavailable') },
    }),
    /IndexedDB unavailable/,
  )
})

test('does not discard an existing snapshot when saving its refresh fails', async () => {
  const original = {
    recordType: OFFLINE_RECORD_TYPES.TRIP,
    key: 'trip-5',
    data: { tripId: 'trip-5', destination: 'Original destination' },
  }
  const storage = createMemoryStorage([original])
  storage.saveOfflineRecord = async () => {
    throw new Error('IndexedDB write failed')
  }

  await assert.rejects(
    saveTripOffline({ id: 'trip-5', destination: 'Updated destination' }, storage),
    /IndexedDB write failed/,
  )
  assert.equal(storage.records.get('trip:trip-5'), original)
})

test('keeps the existing trip snapshot when saving refreshed auxiliary data fails', async () => {
  const original = {
    recordType: OFFLINE_RECORD_TYPES.TRIP,
    key: 'trip-6',
    data: { tripId: 'trip-6', id: 'trip-6', destination: 'Original destination' },
  }
  const storage = createMemoryStorage([original])
  const saveOfflineRecord = storage.saveOfflineRecord
  storage.saveOfflineRecord = async (recordType, key, data) => {
    if (recordType === OFFLINE_RECORD_TYPES.PLACE) {
      throw new Error('Place snapshot write failed')
    }
    return saveOfflineRecord(recordType, key, data)
  }

  await assert.rejects(
    saveTripOffline({
      id: 'trip-6',
      destination: 'Updated destination',
      itinerary: [{
        day_number: 1,
        attractions: [{ place: { name: 'Fort Aguada' } }],
      }],
    }, storage),
    /Place snapshot write failed/,
  )
  assert.equal(storage.records.get('trip:trip-6'), original)
})
