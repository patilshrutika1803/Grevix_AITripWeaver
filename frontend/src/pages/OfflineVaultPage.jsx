import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCacheFreshness } from '../offline/cacheFreshness.js'
import { deleteTripOffline } from '../offline/offlineTripSnapshots.js'
import { listOfflineRecords, OFFLINE_RECORD_TYPES } from '../offline/offlineStorage.js'
import './OfflineVaultPage.css'

function formatSavedAt(value) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Saved time unavailable'
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

function weatherStatus(weatherRecord, tripRecord) {
  if (!weatherRecord && !hasWeather(tripRecord.data)) return ''
  const freshness = getCacheFreshness(weatherRecord || tripRecord)
  return freshness.isStale ? 'Stale · refresh when online' : 'Fresh'
}

export default function OfflineVaultPage() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingTripId, setDeletingTripId] = useState('')

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

  const tripRecords = records.filter((record) => record.recordType === OFFLINE_RECORD_TYPES.TRIP)
  const recordsForTrip = (tripId) => records.filter((record) => record.tripId === tripId)
  const removeDownload = async (tripId) => {
    setDeletingTripId(tripId)
    setError('')
    try {
      await deleteTripOffline(tripId)
      setRecords((current) => current.filter((record) => (
        record.key !== tripId && record.tripId !== tripId
      )))
    } catch (deleteError) {
      setError(deleteError.message || 'This offline download could not be removed.')
    } finally {
      setDeletingTripId('')
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
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading && <p className="page-lede" role="status">Loading offline downloads...</p>}
      {!loading && !error && tripRecords.length === 0 && (
        <div className="empty-itinerary offline-vault-empty">
          <p className="empty-title">Your vault is empty</p>
          <p className="empty-sub">Open a trip while online and choose “Save for Offline” to keep it on this device.</p>
          <Link className="button button-primary" to="/trips">Browse my trips</Link>
        </div>
      )}
      {!loading && tripRecords.length > 0 && (
        <div className="offline-vault-list">
          {tripRecords.map((tripRecord) => {
            const tripId = tripRecord.data?.tripId || tripRecord.key
            const relatedRecords = recordsForTrip(tripId)
            const details = storedInformation(tripRecord, relatedRecords)
            const weatherRecord = relatedRecords.find((record) => (
              record.recordType === OFFLINE_RECORD_TYPES.WEATHER
            ))
            const freshness = weatherStatus(weatherRecord, tripRecord)
            const trip = tripRecord.data || {}
            return (
              <article className="offline-vault-card" key={tripRecord.key}>
                <div className="offline-vault-card-heading">
                  <div>
                    <p className="eyebrow">Saved {formatSavedAt(tripRecord.savedAt)}</p>
                    <h2>{trip.destination || 'Untitled destination'}</h2>
                    <p className="page-lede">{trip.travel_dates || 'Dates not set'}</p>
                  </div>
                  <div className="offline-vault-actions">
                    <Link className="button button-quiet" to={`/trips/${tripId}`}>Open trip</Link>
                    <button
                      className="button button-quiet"
                      onClick={() => removeDownload(tripId)}
                      disabled={deletingTripId === tripId}
                    >
                      {deletingTripId === tripId ? 'Removing...' : 'Remove download'}
                    </button>
                  </div>
                </div>
                <div className="offline-vault-meta">
                  {freshness && <span>Weather: {freshness}</span>}
                  <div className="offline-vault-tags" aria-label="Stored information">
                    {details.map((detail) => <span key={detail}>{detail}</span>)}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
