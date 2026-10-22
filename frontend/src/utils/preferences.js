export function preferenceFormValues(preferences = {}) {
  return {
    travel_style: preferences.travel_style || '',
    interests: preferences.interests || [],
    budget_preference: preferences.budget_preference || '',
    hotel_preference: preferences.hotel_preference || '',
    food_preference: preferences.food_preference || '',
    preferred_destinations: preferences.preferred_destinations || [],
  }
}

export function preferenceDisplayValue(value) {
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'Not set yet'
  return typeof value === 'string' && value.trim() ? value : 'Not set yet'
}
