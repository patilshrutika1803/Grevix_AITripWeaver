import { preferencesApi } from '../api/client.js'

export async function savePreferences(payload, setPreferences) {
  const savedPreferences = await preferencesApi.update(payload)
  setPreferences(savedPreferences)
  return savedPreferences
}
