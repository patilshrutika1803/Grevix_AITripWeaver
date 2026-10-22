import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { preferencesApi } from '../api/client'
import { useAuth } from '../auth/useAuth'
import { usePreferences } from '../preferences/usePreferences'
import { preferenceDisplayValue } from '../utils/preferences'

export default function ProfilePage() {
  const { user, logout } = useAuth()
  const { preferences, setPreferences } = usePreferences()
  const [loading, setLoading] = useState(!preferences)
  const [error, setError] = useState('')
  const hasPreferences = useRef(Boolean(preferences))
  hasPreferences.current = Boolean(preferences)

  useEffect(() => {
    let active = true
    if (!hasPreferences.current) setLoading(true)
    setError('')
    preferencesApi.get()
      .then((savedPreferences) => {
        if (active) setPreferences(savedPreferences)
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Unable to load your saved preferences. Please try again.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [setPreferences, user?.id])

  return <section className="profile-page page-container"><div className="profile-heading"><p className="eyebrow">Your travel identity</p><h1>Profile</h1><p>Keep the details that make every plan feel more like yours.</p></div><div className="profile-layout"><div className="profile-card profile-intro-card"><div className="profile-avatar">{(user?.name || 'P').slice(0, 1).toUpperCase()}</div><h2>{user?.name || 'Traveler'}</h2><p>{user?.email || 'Your email address'}</p><p className="profile-avatar-note">Avatar uses your initials</p></div><div className="profile-card"><ProfilePreferences preferences={preferences} loading={loading} error={error} /></div><div className="profile-card profile-account"><SectionTitle title="Account" /><div className="account-row"><div><strong>Security</strong><p>Password and sign-in settings</p></div><Link className="text-button" to="/forgot-password">Reset password</Link></div><div className="account-row"><div><strong>Notifications</strong><p>Trip updates and planning reminders</p></div><span>In trip workspaces</span></div><button className="logout-button" onClick={logout}>Log out</button></div></div><div className="profile-next"><span>Ready for another idea?</span><Link to="/plan">Plan a new trip ↗</Link></div></section>
}

export function ProfilePreferences({ preferences, loading, error }) {
  const showValues = Boolean(preferences) || !error
  return <>
    <SectionTitle title="Travel preferences" />
    {loading && !preferences
      ? <p className="text-muted" role="status">Loading saved preferences...</p>
      : showValues
        ? <div className="preference-grid">
          <Preference label="Travel style" value={preferenceDisplayValue(preferences?.travel_style)} />
          <Preference label="Budget preference" value={preferenceDisplayValue(preferences?.budget_preference)} />
          <Preference label="Favorite destinations" value={preferenceDisplayValue(preferences?.preferred_destinations)} />
          <Preference label="Interests" value={preferenceDisplayValue(preferences?.interests)} />
        </div>
        : null}
    {error && <p className="form-error" role="alert">{error}</p>}
  </>
}

function SectionTitle({ title }) { return <div className="section-title-row"><h2>{title}</h2><Link className="text-button" to="/preferences">Edit</Link></div> }
function Preference({ label, value }) { return <div className="preference-item"><span>{label}</span><strong>{value}</strong></div> }
