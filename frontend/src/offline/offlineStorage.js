export const OFFLINE_DATABASE_NAME = 'pack-go-offline'
export const OFFLINE_DATABASE_VERSION = 1

export const OFFLINE_RECORD_TYPES = Object.freeze({
  TRIP: 'trip',
  GUIDE: 'guide',
  WEATHER: 'weather',
  PLACE: 'place',
  ROUTE: 'route',
})

const STORE_BY_RECORD_TYPE = Object.freeze({
  [OFFLINE_RECORD_TYPES.TRIP]: 'tripSnapshots',
  [OFFLINE_RECORD_TYPES.GUIDE]: 'guideSnapshots',
  [OFFLINE_RECORD_TYPES.WEATHER]: 'weatherSnapshots',
  [OFFLINE_RECORD_TYPES.PLACE]: 'placeSnapshots',
  [OFFLINE_RECORD_TYPES.ROUTE]: 'routeSnapshots',
})

const INDEXES_BY_STORE = Object.freeze({
  tripSnapshots: ['recordType', 'savedAt', 'updatedAt', 'destination'],
  guideSnapshots: ['recordType', 'savedAt', 'updatedAt', 'destination', 'category'],
  weatherSnapshots: ['recordType', 'savedAt', 'updatedAt', 'location'],
  placeSnapshots: ['recordType', 'savedAt', 'updatedAt', 'destination', 'category'],
  routeSnapshots: ['recordType', 'savedAt', 'updatedAt', 'tripId', 'destination'],
})

const SENSITIVE_FIELD_PATTERN = /token|password|secret|credential|authorization|cookie|private.?key|access.?key|api.?key/i

export class OfflineStorageError extends Error {
  constructor(message, options = {}) {
    super(message, options)
    this.name = 'OfflineStorageError'
  }
}

function assertRecordType(recordType) {
  if (!Object.hasOwn(STORE_BY_RECORD_TYPE, recordType)) {
    throw new TypeError(`Unsupported offline record type: ${recordType}`)
  }
}

function assertKey(key) {
  if (typeof key !== 'string' || !key.trim()) {
    throw new TypeError('Offline record keys must be non-empty strings.')
  }
  if (SENSITIVE_FIELD_PATTERN.test(key)) {
    throw new TypeError('Offline record keys cannot contain sensitive values.')
  }
}

function assertSafeData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new TypeError('Offline snapshot data must be an object.')
  }

  const visited = new Set()
  const visit = (value) => {
    if (!value || typeof value !== 'object' || visited.has(value)) return
    visited.add(value)

    for (const [field, nestedValue] of Object.entries(value)) {
      if (SENSITIVE_FIELD_PATTERN.test(field)) {
        throw new TypeError(`Offline snapshots cannot contain sensitive field "${field}".`)
      }
      visit(nestedValue)
    }
  }
  visit(data)

  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(data)
    } catch (cause) {
      throw new TypeError('Offline snapshot data must be structured-clone-compatible.', { cause })
    }
  }

  return data
}

function addIndexes(database, storeName) {
  const store = database.createObjectStore(storeName, { keyPath: 'key' })
  for (const indexName of INDEXES_BY_STORE[storeName]) {
    store.createIndex(indexName, indexName, { unique: false })
  }
}

function createStorageError(operation, cause) {
  if (cause instanceof OfflineStorageError) return cause
  return new OfflineStorageError(`Could not ${operation} offline data.`, { cause })
}

function normalizeTimestamp(value, label) {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError(`${label} must be a valid timestamp.`)
  }
  return date.toISOString()
}

export function createOfflineStorage({ indexedDB = globalThis.indexedDB, now = () => new Date().toISOString() } = {}) {
  let databasePromise

  const openDatabase = () => {
    if (!indexedDB || typeof indexedDB.open !== 'function') {
      return Promise.reject(new OfflineStorageError('IndexedDB is not available in this browser.'))
    }
    if (databasePromise) return databasePromise

    databasePromise = new Promise((resolve, reject) => {
      let request
      try {
        request = indexedDB.open(OFFLINE_DATABASE_NAME, OFFLINE_DATABASE_VERSION)
      } catch (cause) {
        reject(createStorageError('open the offline database', cause))
        return
      }

      request.onupgradeneeded = () => {
        const database = request.result
        for (const storeName of Object.keys(INDEXES_BY_STORE)) {
          if (!database.objectStoreNames.contains(storeName)) addIndexes(database, storeName)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(createStorageError('open the offline database', request.error))
      request.onblocked = () => reject(new OfflineStorageError('Opening the offline database was blocked by another connection.'))
    }).catch((error) => {
      databasePromise = undefined
      throw error
    })

    return databasePromise
  }

  const transact = async (storeName, mode, operation, label) => {
    const database = await openDatabase()
    return new Promise((resolve, reject) => {
      let transaction
      let result
      let failure

      const fail = (cause) => {
        failure = createStorageError(label, cause)
        if (!transaction) {
          reject(failure)
          return
        }
        try {
          transaction.abort()
        } catch {
          reject(failure)
        }
      }

      try {
        transaction = database.transaction(storeName, mode)
        transaction.oncomplete = () => failure ? reject(failure) : resolve(result)
        transaction.onerror = () => {
          failure = createStorageError(label, transaction.error)
        }
        transaction.onabort = () => reject(failure || createStorageError(label, transaction.error))
        const store = transaction.objectStore(storeName)
        operation(store, (value) => { result = value }, fail)
      } catch (cause) {
        fail(cause)
      }
    })
  }

  const saveOfflineRecord = async (recordType, key, data, { savedAt, updatedAt } = {}) => {
    assertRecordType(recordType)
    assertKey(key)
    const snapshot = assertSafeData(data)
    const storeName = STORE_BY_RECORD_TYPE[recordType]

    return transact(storeName, 'readwrite', (store, setResult, fail) => {
      const getRequest = store.get(key)
      getRequest.onerror = () => fail(getRequest.error)
      getRequest.onsuccess = () => {
        try {
          const timestamp = normalizeTimestamp(now(), 'Offline storage clock value')
          const record = {
            key,
            recordType,
            savedAt: normalizeTimestamp(savedAt ?? getRequest.result?.savedAt ?? timestamp, 'savedAt'),
            updatedAt: normalizeTimestamp(updatedAt ?? timestamp, 'updatedAt'),
            data: snapshot,
          }
          const metadataFields = ['destination', 'location', 'category']
          for (const field of metadataFields) {
            if (typeof snapshot[field] === 'string') record[field] = snapshot[field]
          }
          const tripId = snapshot.tripId ?? snapshot.trip_id
          if (typeof tripId === 'string') record.tripId = tripId

          const putRequest = store.put(record)
          putRequest.onerror = () => fail(putRequest.error)
          putRequest.onsuccess = () => setResult(record)
        } catch (cause) {
          fail(cause)
        }
      }
    }, 'save offline data')
  }

  const getOfflineRecord = async (recordType, key) => {
    assertRecordType(recordType)
    assertKey(key)
    return transact(STORE_BY_RECORD_TYPE[recordType], 'readonly', (store, setResult, fail) => {
      const request = store.get(key)
      request.onsuccess = () => setResult(request.result)
      request.onerror = () => fail(request.error)
    }, 'retrieve offline data')
  }

  const listOfflineRecords = async (recordType, { limit } = {}) => {
    if (recordType !== undefined) assertRecordType(recordType)
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
      throw new TypeError('Offline record list limits must be non-negative integers.')
    }

    const recordTypes = recordType === undefined ? Object.keys(STORE_BY_RECORD_TYPE) : [recordType]
    const records = await Promise.all(recordTypes.map((type) => {
      const storeName = STORE_BY_RECORD_TYPE[type]
      return transact(storeName, 'readonly', (store, setResult, fail) => {
        const request = store.index('recordType').getAll(type)
        request.onsuccess = () => setResult(request.result)
        request.onerror = () => fail(request.error)
      }, 'list offline data')
    }))
    const sortedRecords = records.flat().sort((left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt))
    return limit === undefined ? sortedRecords : sortedRecords.slice(0, limit)
  }

  const deleteOfflineRecord = async (recordType, key) => {
    assertRecordType(recordType)
    assertKey(key)
    return transact(STORE_BY_RECORD_TYPE[recordType], 'readwrite', (store, setResult, fail) => {
      const request = store.delete(key)
      request.onsuccess = () => setResult(true)
      request.onerror = () => fail(request.error)
    }, 'delete offline data')
  }

  return Object.freeze({
    saveOfflineRecord,
    getOfflineRecord,
    listOfflineRecords,
    deleteOfflineRecord,
  })
}

const defaultStorage = createOfflineStorage()

export const saveOfflineRecord = (...args) => defaultStorage.saveOfflineRecord(...args)
export const getOfflineRecord = (...args) => defaultStorage.getOfflineRecord(...args)
export const listOfflineRecords = (...args) => defaultStorage.listOfflineRecords(...args)
export const deleteOfflineRecord = (...args) => defaultStorage.deleteOfflineRecord(...args)
