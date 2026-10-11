import { OFFLINE_RECORD_TYPES } from './offlineStorage.js'

export const CACHE_TTL_MS = Object.freeze({
  [OFFLINE_RECORD_TYPES.WEATHER]: 6 * 60 * 60 * 1000,
  [OFFLINE_RECORD_TYPES.GUIDE]: 30 * 24 * 60 * 60 * 1000,
  [OFFLINE_RECORD_TYPES.PLACE]: 7 * 24 * 60 * 60 * 1000,
  [OFFLINE_RECORD_TYPES.ROUTE]: 7 * 24 * 60 * 60 * 1000,
})

export function getCacheFreshness(record, { now = Date.now(), ttlByType = {} } = {}) {
  const savedAtMs = Date.parse(record?.savedAt)
  const currentTimeMs = now instanceof Date
    ? now.getTime()
    : typeof now === 'string'
      ? Date.parse(now)
      : Number(now)
  const hasValidTimestamp = Number.isFinite(savedAtMs) && Number.isFinite(currentTimeMs)
  const ageMs = hasValidTimestamp ? Math.max(0, currentTimeMs - savedAtMs) : null
  const type = record?.recordType
  const ttlMs = Object.hasOwn(ttlByType, type) ? ttlByType[type] : CACHE_TTL_MS[type]
  if (ttlMs !== null && ttlMs !== undefined && (!Number.isFinite(ttlMs) || ttlMs < 0)) {
    throw new RangeError('Cache TTL values must be non-negative finite numbers or null.')
  }
  const expiresAtMs = hasValidTimestamp && Number.isFinite(ttlMs)
    ? savedAtMs + ttlMs
    : null
  const isStale = ttlMs !== null && ttlMs !== undefined
    ? !hasValidTimestamp || currentTimeMs >= expiresAtMs
    : false

  return {
    ageMs,
    expiresAt: expiresAtMs === null ? null : new Date(expiresAtMs).toISOString(),
    ttlMs: Number.isFinite(ttlMs) ? ttlMs : null,
    isStale,
    isExpired: isStale,
  }
}
