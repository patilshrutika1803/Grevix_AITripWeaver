import {
  deleteOfflineRecord,
  listOfflineRecords,
  OFFLINE_RECORD_TYPES,
  saveOfflineRecord,
} from './offlineStorage.js'

function hasObjectData(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length > 0
}

function collectItineraryPlaces(itinerary) {
  if (!Array.isArray(itinerary)) return []

  return itinerary.flatMap((day) => {
    if (!Array.isArray(day?.attractions)) return []
    return day.attractions
      .filter((attraction) => hasObjectData(attraction?.place))
      .map((attraction) => ({
        day_number: day.day_number,
        place: attraction.place,
      }))
  })
}

export function buildTripOfflineSnapshots(trip) {
  if (!trip || typeof trip.id !== 'string' || !trip.id.trim()) {
    throw new TypeError('A trip with an ID is required to save it offline.')
  }

  const tripId = trip.id
  const tripData = {
    tripId,
    id: tripId,
    destination: trip.destination,
    duration: trip.duration,
    total_budget: trip.total_budget,
    budget_currency: trip.budget_currency,
    budget_breakdown: trip.budget_breakdown,
    group_size: trip.group_size,
    travel_dates: trip.travel_dates,
    travel_style: trip.travel_style,
    interests: trip.interests,
    itinerary: trip.itinerary,
    critic_review: trip.critic_review,
    created_at: trip.created_at,
  }
  const snapshots = [{
    recordType: OFFLINE_RECORD_TYPES.TRIP,
    key: tripId,
    data: tripData,
  }]

  if (hasObjectData(trip.weather)) {
    tripData.weather = trip.weather
    snapshots.push({
      recordType: OFFLINE_RECORD_TYPES.WEATHER,
      key: `${tripId}:weather`,
      data: {
        tripId,
        destination: trip.destination,
        location: trip.destination,
        weather: trip.weather,
      },
    })
  }

  const places = collectItineraryPlaces(trip.itinerary)
  if (places.length > 0) {
    snapshots.push({
      recordType: OFFLINE_RECORD_TYPES.PLACE,
      key: `${tripId}:places`,
      data: {
        tripId,
        destination: trip.destination,
        places,
      },
    })
  }

  return snapshots
}

export async function saveTripOffline(trip, storage = {
  saveOfflineRecord,
}) {
  const snapshots = buildTripOfflineSnapshots(trip)
  const savedRecords = []
  for (const snapshot of snapshots) {
    savedRecords.push(await storage.saveOfflineRecord(
      snapshot.recordType,
      snapshot.key,
      snapshot.data,
    ))
  }
  return savedRecords[0]
}

export async function deleteTripOffline(tripId, storage = {
  deleteOfflineRecord,
  listOfflineRecords,
}) {
  if (typeof tripId !== 'string' || !tripId.trim()) {
    throw new TypeError('A trip ID is required to remove an offline download.')
  }

  const recordTypes = Object.values(OFFLINE_RECORD_TYPES)
  const recordsByType = await Promise.all(recordTypes.map(async (recordType) => ({
    recordType,
    records: await storage.listOfflineRecords(recordType),
  })))
  const associatedRecords = recordsByType.flatMap(({ recordType, records }) => records
    .filter((record) => recordType === OFFLINE_RECORD_TYPES.TRIP
      ? record.key === tripId
      : record.tripId === tripId)
    .map((record) => ({ recordType, key: record.key })))

  await Promise.all(associatedRecords.map(({ recordType, key }) => (
    storage.deleteOfflineRecord(recordType, key)
  )))
}
