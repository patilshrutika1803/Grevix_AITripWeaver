import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { PreferencesContext } from './context'

export default function PreferencesProvider({ children }) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [storedPreferences, setStoredPreferences] = useState({ userId, preferences: null })

  useEffect(() => {
    setStoredPreferences((current) => current.userId === userId
      ? current
      : { userId, preferences: null })
  }, [userId])

  const setPreferences = useCallback((preferences) => {
    setStoredPreferences({ userId, preferences })
  }, [userId])
  const value = useMemo(() => ({
    preferences: storedPreferences.userId === userId ? storedPreferences.preferences : null,
    setPreferences,
  }), [setPreferences, storedPreferences, userId])

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}
