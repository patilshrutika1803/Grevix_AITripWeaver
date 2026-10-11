import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createOfflineStorage,
  OFFLINE_DATABASE_NAME,
  OFFLINE_DATABASE_VERSION,
  OFFLINE_RECORD_TYPES,
  OfflineStorageError,
} from '../src/offline/offlineStorage.js'
import { CACHE_TTL_MS, getCacheFreshness } from '../src/offline/cacheFreshness.js'

class FakeRequest {
  constructor(operation) {
    this.result = undefined
    this.error = null
    this.onsuccess = null
    this.onerror = null

    queueMicrotask(() => {
      try {
        this.result = operation()
        this.onsuccess?.()
      } catch (error) {
        this.error = error
        this.onerror?.()
      }
    })
  }
}

class FakeObjectStore {
  constructor(store, transaction) {
    this.store = store
    this.transaction = transaction
  }

  createIndex(name, keyPath) {
    this.store.indexes.set(name, keyPath)
  }

  index(name) {
    const keyPath = this.store.indexes.get(name)
    if (!keyPath) throw new Error(`Index ${name} does not exist.`)
    return {
      getAll: (query) => new FakeRequest(() => [...this.store.records.values()]
        .filter((record) => record[keyPath] === query)),
    }
  }

  get(key) {
    return new FakeRequest(() => this.store.records.get(key))
  }

  getAll() {
    return new FakeRequest(() => [...this.store.records.values()])
  }

  put(record) {
    return new FakeRequest(() => {
      this.store.records.set(record.key, record)
      return record.key
    })
  }

  delete(key) {
    return new FakeRequest(() => this.store.records.delete(key))
  }
}

class FakeDatabase {
  constructor() {
    this.stores = new Map()
    this.objectStoreNames = { contains: (name) => this.stores.has(name) }
  }

  createObjectStore(name) {
    const store = { records: new Map(), indexes: new Map() }
    this.stores.set(name, store)
    return new FakeObjectStore(store)
  }

  transaction(_storeName) {
    const transaction = {
      error: null,
      objectStore: (name) => {
        const store = this.stores.get(name)
        if (!store) throw new Error(`Object store ${name} does not exist.`)
        return new FakeObjectStore(store, transaction)
      },
      abort: () => setTimeout(() => transaction.onabort?.(), 0),
    }
    setTimeout(() => transaction.oncomplete?.(), 0)
    return transaction
  }
}

class FakeIndexedDB {
  constructor({ failTransactions = false } = {}) {
    this.database = null
    this.failTransactions = failTransactions
  }

  open(name, version) {
    const request = { result: null, error: null }
    queueMicrotask(() => {
      if (!this.database) {
        this.database = new FakeDatabase()
        if (this.failTransactions) {
          this.database.transaction = () => { throw new Error('Transaction creation failed.') }
        }
        request.result = this.database
        request.onupgradeneeded?.()
      } else {
        request.result = this.database
      }
      assert.equal(name, OFFLINE_DATABASE_NAME)
      assert.equal(version, OFFLINE_DATABASE_VERSION)
      request.onsuccess?.()
    })
    return request
  }
}

test('offline storage creates indexed stores and supports save, retrieve, list, and delete', async () => {
  let currentTime = '2026-10-01T12:00:00.000Z'
  const indexedDB = new FakeIndexedDB()
  const storage = createOfflineStorage({ indexedDB, now: () => currentTime })
  const trip = { id: 'trip-1', destination: 'Goa', itinerary: [{ day_number: 1, attractions: [] }] }

  const savedTrip = await storage.saveOfflineRecord(OFFLINE_RECORD_TYPES.TRIP, 'trip-1', trip)
  assert.deepEqual([...indexedDB.database.stores.keys()], [
    'tripSnapshots',
    'guideSnapshots',
    'weatherSnapshots',
    'placeSnapshots',
    'routeSnapshots',
  ])
  assert.deepEqual([...indexedDB.database.stores.get('tripSnapshots').indexes.keys()], [
    'recordType',
    'savedAt',
    'updatedAt',
    'destination',
  ])
  assert.deepEqual(savedTrip.data, trip)
  assert.equal(savedTrip.key, 'trip-1')
  assert.equal(savedTrip.savedAt, currentTime)
  assert.equal(savedTrip.updatedAt, currentTime)
  assert.deepEqual(await storage.getOfflineRecord(OFFLINE_RECORD_TYPES.TRIP, 'trip-1'), savedTrip)
  assert.deepEqual(await storage.listOfflineRecords(OFFLINE_RECORD_TYPES.TRIP), [savedTrip])

  currentTime = '2026-10-02T12:00:00.000Z'
  const updatedTrip = await storage.saveOfflineRecord(OFFLINE_RECORD_TYPES.TRIP, 'trip-1', {
    ...trip,
    destination: 'Pune',
  })
  assert.equal(updatedTrip.savedAt, '2026-10-01T12:00:00.000Z')
  assert.equal(updatedTrip.updatedAt, currentTime)
  assert.equal(updatedTrip.destination, 'Pune')

  await storage.saveOfflineRecord(OFFLINE_RECORD_TYPES.GUIDE, 'guide-5', {
    id: 'guide-5',
    destination: 'Goa',
    category: 'travel_guide',
    document_type: 'destination_guide',
  })
  assert.deepEqual(
    (await storage.listOfflineRecords()).map((record) => record.key).sort(),
    ['guide-5', 'trip-1'],
  )
  assert.deepEqual(await storage.listOfflineRecords(undefined, { limit: 1 }).then((records) => records.map(({ key }) => key)), ['guide-5'])

  assert.equal(await storage.deleteOfflineRecord(OFFLINE_RECORD_TYPES.TRIP, 'trip-1'), true)
  assert.equal(await storage.getOfflineRecord(OFFLINE_RECORD_TYPES.TRIP, 'trip-1'), undefined)
})

test('offline storage rejects unavailable IndexedDB and sensitive snapshot fields', async () => {
  const unavailableStorage = createOfflineStorage({ indexedDB: undefined })
  await assert.rejects(
    unavailableStorage.listOfflineRecords(),
    (error) => error instanceof OfflineStorageError && /IndexedDB is not available/.test(error.message),
  )

  const storage = createOfflineStorage({ indexedDB: new FakeIndexedDB() })
  await assert.rejects(
    storage.saveOfflineRecord(OFFLINE_RECORD_TYPES.TRIP, 'trip-2', {
      id: 'trip-2',
      metadata: { refresh_token: 'not-to-be-stored' },
    }),
    /sensitive field/,
  )
  await assert.rejects(
    storage.saveOfflineRecord(OFFLINE_RECORD_TYPES.TRIP, 'access-token-value', { id: 'trip-3' }),
    /sensitive values/,
  )
})

test('offline storage reports transaction failures instead of leaving operations pending', async () => {
  const storage = createOfflineStorage({ indexedDB: new FakeIndexedDB({ failTransactions: true }) })
  await assert.rejects(
    storage.listOfflineRecords(OFFLINE_RECORD_TYPES.TRIP),
    (error) => error instanceof OfflineStorageError && /Could not list offline data/.test(error.message),
  )
})

test('cache freshness applies defaults, configurable TTLs, and non-expiring trip snapshots', () => {
  const savedAt = '2026-10-01T00:00:00.000Z'
  const now = new Date(savedAt).getTime() + CACHE_TTL_MS[OFFLINE_RECORD_TYPES.WEATHER]
  const weatherFreshness = getCacheFreshness(
    { recordType: OFFLINE_RECORD_TYPES.WEATHER, savedAt },
    { now },
  )
  assert.equal(weatherFreshness.ageMs, CACHE_TTL_MS.weather)
  assert.equal(weatherFreshness.ttlMs, CACHE_TTL_MS.weather)
  assert.equal(weatherFreshness.isStale, true)
  assert.equal(weatherFreshness.expiresAt, new Date(now).toISOString())

  assert.equal(getCacheFreshness(
    { recordType: OFFLINE_RECORD_TYPES.GUIDE, savedAt },
    { now: Date.parse(savedAt) + CACHE_TTL_MS.guide - 1 },
  ).isStale, false)
  assert.equal(getCacheFreshness(
    { recordType: OFFLINE_RECORD_TYPES.PLACE, savedAt },
    { now: Date.parse(savedAt) + 1000, ttlByType: { place: 500 } },
  ).isStale, true)

  const tripFreshness = getCacheFreshness(
    { recordType: OFFLINE_RECORD_TYPES.TRIP, savedAt },
    { now: Date.parse(savedAt) + 100 * 365 * 24 * 60 * 60 * 1000 },
  )
  assert.equal(tripFreshness.ttlMs, null)
  assert.equal(tripFreshness.expiresAt, null)
  assert.equal(tripFreshness.isStale, false)
})

test('cache freshness measures age from the last update when available', () => {
  const savedAt = '2026-10-01T00:00:00.000Z'
  const updatedAt = '2026-10-11T13:00:00.000Z'
  const freshness = getCacheFreshness({
    recordType: OFFLINE_RECORD_TYPES.WEATHER,
    savedAt,
    updatedAt,
  }, { now: Date.parse(updatedAt) + 500 })

  assert.equal(freshness.ageMs, 500)
  assert.equal(freshness.isStale, false)
})

test('freshness marks invalid timestamps stale when the record type has a TTL', () => {
  assert.deepEqual(getCacheFreshness(
    { recordType: OFFLINE_RECORD_TYPES.WEATHER, savedAt: 'not-a-date' },
    { now: Date.now() },
  ), {
    ageMs: null,
    expiresAt: null,
    ttlMs: CACHE_TTL_MS.weather,
    isStale: true,
    isExpired: true,
  })
})
