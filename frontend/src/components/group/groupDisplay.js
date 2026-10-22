export function getItinerarySummary(trip) {
  const days = Array.isArray(trip?.itinerary) ? trip.itinerary : []
  const activityCount = days.reduce((count, day) => (
    count + (Array.isArray(day?.activities) ? day.activities.length : 0)
  ), 0)

  return { days, dayCount: days.length, activityCount }
}

export function getMessageSenderLabel(message) {
  return message?.sender_name?.trim() || 'Former member'
}

export function formatMessageTimestamp(value, timeZone) {
  if (typeof value !== 'string' || !value.trim()) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, timeZone ? { timeZone } : undefined)
}
