import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { tripsApi } from '../api/client'
import { getCacheFreshness } from '../offline/cacheFreshness.js'
import {
  deleteTripOffline,
  isValidTripSnapshot,
  saveTripOffline,
} from '../offline/offlineTripSnapshots.js'
import { listOfflineRecords, OFFLINE_RECORD_TYPES } from '../offline/offlineStorage.js'
import './OfflineVaultPage.css'

function formatSavedAt(value) {
  if (value === null || value === undefined || value === '') return 'Saved time unavailable'
  try {
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Saved time unavailable'
  } catch {
    return 'Saved time unavailable'
  }
}

function hasValidTimestamp(record) {
  try {
    return Number.isFinite(Date.parse(record.updatedAt ?? record.savedAt))
  } catch {
    return false
  }
}

function displayText(...values) {
  return values.find((value) => typeof value === 'string' && value.trim()) || ''
}

function hasWeather(data) {
  return Boolean(data?.weather && typeof data.weather === 'object' && Object.keys(data.weather).length)
}

function storedInformation(tripRecord, records) {
  const data = tripRecord.data || {}
  const types = new Set(records.map((record) => record.recordType))
  const details = []
  if (Array.isArray(data.itinerary) && data.itinerary.length) details.push('Itinerary')
  if (data.total_budget !== undefined || data.budget_breakdown) details.push('Budget')
  if (hasWeather(data) || types.has(OFFLINE_RECORD_TYPES.WEATHER)) details.push('Weather')
  if (types.has(OFFLINE_RECORD_TYPES.GUIDE)) details.push('Travel guide')
  if (types.has(OFFLINE_RECORD_TYPES.PLACE)) details.push('Places')
  if (types.has(OFFLINE_RECORD_TYPES.ROUTE)) details.push('Route')
  return details
}

function tripFreshness(tripRecord, relatedRecords) {
  const recordsToCheck = [tripRecord, ...relatedRecords]
  let hasUnavailableMetadata = false

  for (const record of recordsToCheck) {
    if (!hasValidTimestamp(record)) {
      hasUnavailableMetadata = true
      continue
    }
    if (getCacheFreshness(record).isStale) return 'stale'
  }

  return hasUnavailableMetadata ? 'unavailable' : 'fresh'
}

function nonEmptyValue(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return Boolean(value.trim())
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

function mergeTripRefresh(savedTrip, refreshedTrip, tripId) {
  const mergedTrip = { ...savedTrip, id: tripId }
  for (const [field, value] of Object.entries(refreshedTrip)) {
    if (field !== 'id' && field !== 'tripId' && nonEmptyValue(value)) {
      mergedTrip[field] = value
    }
  }
  return mergedTrip
}

function itinerarySummary(itinerary) {
  if (!Array.isArray(itinerary)) return []
  return itinerary.map((day, index) => {
    const stops = Array.isArray(day?.attractions)
      ? day.attractions
        .map((attraction) => attraction?.place?.name || attraction?.name)
        .filter((name) => typeof name === 'string' && name.trim())
      : []
    const dayLabel = day?.day_number ?? index + 1
    const title = day?.theme || day?.title
    return {
      key: day?.day_number ?? index,
      label: `Day ${dayLabel}${title ? ` · ${title}` : ''}`,
      stops,
    }
  })
}

export function OfflineVaultContent({
  records,
  loading,
  error,
  onRemove,
  onRefresh,
  isOnline = true,
  deletingTripId = '',
  refreshingTripId = '',
}) {
  const safeRecords = Array.isArray(records)
    ? records.filter((record) => record && typeof record === 'object' && !Array.isArray(record))
    : []
  const tripRecords = safeRecords.filter((record) => record.recordType === OFFLINE_RECORD_TYPES.TRIP)
  const recordsForTrip = (tripId) => safeRecords.filter((record) => record.tripId === tripId)

  if (loading) return <p className="page-lede" role="status">Loading offline downloads...</p>
  return (
    <>
      <div className="offline-vault-summary" aria-live="polite">
        <strong>{tripRecords.length} saved {tripRecords.length === 1 ? 'trip' : 'trips'}</strong>
        <span className={`offline-vault-connectivity${isOnline ? ' is-online' : ' is-offline'}`} role="status">
          {isOnline ? 'Online' : 'Offline'}
        </span>
      </div>
      {error && <p className="form-error offline-vault-error" role="alert">{error}</p>}
      {tripRecords.length === 0 && !error ? (
        <div className="empty-itinerary offline-vault-empty">
          <p className="empty-title">Your vault is empty</p>
          <p className="empty-sub">Open a trip while online and choose “Save for Offline” to keep it on this device.</p>
          <Link className="button button-primary" to="/trips">Browse my trips</Link>
        </div>
      ) : tripRecords.length > 0 ? (
        <div className="offline-vault-list">
          {tripRecords.map((tripRecord, index) => {
            const storedTrip = tripRecord.data
            const tripId = typeof tripRecord.key === 'string' && tripRecord.key.trim()
              ? tripRecord.key
              : storedTrip?.tripId || storedTrip?.id
            const isValidSnapshot = isValidTripSnapshot(storedTrip, tripId)
            const relatedRecords = recordsForTrip(tripId)
            const details = storedInformation(
              isValidSnapshot ? tripRecord : { ...tripRecord, data: {} },
              relatedRecords,
            )
            const status = tripFreshness(tripRecord, relatedRecords)
            const trip = isValidSnapshot ? storedTrip : {}
            const days = itinerarySummary(trip.itinerary)
            const recordKey = typeof tripRecord.key === 'string' && tripRecord.key
              ? tripRecord.key
              : `invalid-${index}`
            const freshnessLabel = status === 'stale'
              ? 'Stale'
              : status === 'unavailable'
                ? 'Unavailable metadata'
                : 'Fresh'
            return (
              <article className="offline-vault-card" key={recordKey}>
                <div className="offline-vault-card-heading">
                  <div>
                    <p className="eyebrow">Saved {formatSavedAt(tripRecord.savedAt)}</p>
                    {tripRecord.updatedAt && tripRecord.updatedAt !== tripRecord.savedAt && (
                      <p className="offline-vault-updated">Last updated {formatSavedAt(tripRecord.updatedAt)}</p>
                    )}
                    <h2>{displayText(trip.title, trip.destination) || 'Untitled destination'}</h2>
                    <p className="page-lede">{displayText(trip.travel_dates) || 'Dates not set'}</p>
                  </div>
                  <div className="offline-vault-actions">
                    {typeof tripId === 'string' && tripId.trim() && (
                      <Link className="button button-quiet" to={`/trips/${tripId}`}>Open trip</Link>
                    )}
                    {isOnline && typeof tripId === 'string' && tripId.trim()
                      && (status !== 'fresh' || !isValidSnapshot) && (
                      <button
                        className="button button-quiet"
                        onClick={() => onRefresh(tripId, trip)}
                        disabled={refreshingTripId === tripId || deletingTripId === tripId}
                      >
                        {refreshingTripId === tripId ? 'Refreshing...' : 'Refresh snapshot'}
                      </button>
                    )}
                    {typeof tripId === 'string' && tripId.trim() && (
                      <button
                        className="button button-quiet"
                        onClick={() => onRemove(tripId)}
                        disabled={deletingTripId === tripId || refreshingTripId === tripId}
                      >
                        {deletingTripId === tripId ? 'Removing...' : 'Remove download'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="offline-vault-meta">
                  <span
                    className={`offline-vault-freshness is-${status}`}
                    aria-label={`Freshness: ${freshnessLabel}`}
                  >
                    Freshness: {freshnessLabel}
                  </span>
                  <span>
                    Trip snapshot: {hasValidTimestamp(tripRecord)
                      ? 'Available offline · no expiry'
                      : 'Saved-time metadata unavailable'}
                  </span>
                  {!isValidSnapshot && (
                    <p className="page-lede" role="status">
                      This saved trip is incomplete. Refresh it online if possible, or save the trip again.
                    </p>
                  )}
                  {days.length > 0 && (
                    <div className="offline-vault-itinerary" aria-label="Saved itinerary">
                      <strong>Itinerary</strong>
                      {days.map((day) => (
                        <p key={day.key}>
                          <span>{day.label}</span>
                          {day.stops.length > 0 && ` — ${day.stops.join(', ')}`}
                        </p>
                      ))}
                    </div>
                  )}
                  <div className="offline-vault-tags" aria-label="Stored information">
                    {details.map((detail) => <span key={detail}>{detail}</span>)}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      ) : null}
    </>
  )
}

export default function OfflineVaultPage() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingTripId, setDeletingTripId] = useState('')
  const [refreshingTripId, setRefreshingTripId] = useState('')
  const [isOnline, setIsOnline] = useState(() => globalThis.navigator?.onLine !== false)

  const loadVault = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setRecords(await listOfflineRecords())
    } catch (loadError) {
      setError(loadError.message || 'Offline downloads could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadVault()
  }, [loadVault])

  useEffect(() => {
    const updateConnectivity = () => setIsOnline(globalThis.navigator?.onLine !== false)
    globalThis.addEventListener?.('online', updateConnectivity)
    globalThis.addEventListener?.('offline', updateConnectivity)
    return () => {
      globalThis.removeEventListener?.('online', updateConnectivity)
      globalThis.removeEventListener?.('offline', updateConnectivity)
    }
  }, [])

  const removeDownload = async (tripId) => {
    if (typeof globalThis.confirm === 'function'
      && !globalThis.confirm('Remove this trip download from this device? The online trip will not be deleted.')) return
    setDeletingTripId(tripId)
    setError('')
    try {
      await deleteTripOffline(tripId)
      setRecords((current) => current.filter((record) => (
        record.recordType === OFFLINE_RECORD_TYPES.TRIP
          ? record.key !== tripId
          : record.tripId !== tripId
      )))
    } catch (deleteError) {
      setError(deleteError.message || 'This offline download could not be removed.')
    } finally {
      setDeletingTripId('')
    }
  }

  const refreshDownload = async (tripId, savedTrip) => {
    setRefreshingTripId(tripId)
    setError('')
    try {
      const refreshedTrip = await tripsApi.get(tripId)
      if (!refreshedTrip
        || typeof refreshedTrip !== 'object'
        || Array.isArray(refreshedTrip)
        || refreshedTrip.id !== tripId
        || typeof refreshedTrip.destination !== 'string'
        || !refreshedTrip.destination.trim()) {
        throw new Error('The server returned incomplete trip data. Your offline download was not changed.')
      }
      await saveTripOffline(mergeTripRefresh(savedTrip, refreshedTrip, tripId))
      await loadVault()
    } catch (refreshError) {
      setError(refreshError.message || 'This offline download could not be refreshed.')
    } finally {
      setRefreshingTripId('')
    }
  }

  return (
    <section className="page-container offline-vault-page">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">PACK &amp; GO · OFFLINE</p>
          <h1>Offline Travel Vault</h1>
          <p className="page-lede">Trips saved on this device, ready when you are disconnected.</p>
        </div>
        <Link className="button button-quiet" to="/trips">My trips</Link>
      </div>
      <OfflineVaultContent
        records={records}
        loading={loading}
        error={error}
        onRemove={removeDownload}
        onRefresh={refreshDownload}
        isOnline={isOnline}
        deletingTripId={deletingTripId}
        refreshingTripId={refreshingTripId}
      />
    </section>
  )
}
