import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { getSupabaseClient } from '../auth/supabase'

const EMAIL_OTP_TYPES = new Set(['email', 'email_change', 'invite', 'magiclink', 'recovery', 'signup'])

function getCallbackParams(location) {
  const search = new URLSearchParams(location.search)
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''))
  const error = search.get('error_description')
    || hash.get('error_description')
    || search.get('error_code')
    || hash.get('error_code')
    || search.get('error')
    || hash.get('error')

  return {
    error,
    hasPayload: Boolean(
      error
      || search.get('code')
      || search.get('token_hash')
      || search.get('type')
      || hash.get('access_token')
      || hash.get('error')
      || hash.get('error_description'),
    ),
    tokenHash: search.get('token_hash'),
    type: search.get('type'),
  }
}

export default function AuthCallbackPage() {
  const location = useLocation()
  const { isAuthenticated, isLoading, authError } = useAuth()
  const callback = getCallbackParams(location)
  const tokenVerification = useRef(null)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (callback.error || !callback.tokenHash) return

    if (!EMAIL_OTP_TYPES.has(callback.type)) {
      setResult({ type: 'error', message: 'This confirmation link is missing a valid email verification type.' })
      return
    }

    if (!tokenVerification.current) {
      try {
        tokenVerification.current = getSupabaseClient().auth.verifyOtp({
          token_hash: callback.tokenHash,
          type: callback.type,
        })
      } catch (error) {
        setResult({ type: 'error', message: error.message || 'Unable to confirm your email. Request a new link and try again.' })
        return
      }
    }

    let active = true
    tokenVerification.current.then(({ error }) => {
      if (!active) return
      setResult(error
        ? { type: 'error', message: error.message }
        : { type: 'success', message: 'Your email has been confirmed. You can now continue to PACK & GO.' })
    }).catch((error) => {
      if (active) setResult({ type: 'error', message: error.message || 'Unable to confirm your email. Request a new link and try again.' })
    })

    return () => { active = false }
  }, [callback.error, callback.tokenHash, callback.type])

  useEffect(() => {
    if (callback.error) {
      setResult({ type: 'error', message: callback.error })
    } else if (callback.hasPayload && !callback.tokenHash && isAuthenticated) {
      setResult({ type: 'success', message: 'Your email has been confirmed. You can now continue to PACK & GO.' })
    } else if (!callback.tokenHash && callback.hasPayload && !isLoading && !isAuthenticated) {
      setResult({
        type: 'error',
        message: authError || 'We could not complete this confirmation link. It may have expired; request a new link and try again.',
      })
    } else if (!callback.hasPayload) {
      setResult({ type: 'error', message: 'This page needs a valid email confirmation link. Request a new link or log in.' })
    }
  }, [authError, callback.error, callback.hasPayload, callback.tokenHash, isAuthenticated, isLoading])

  return (
    <section className="auth-experience">
      <div className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-card-heading">
            <p className="auth-card-kicker">PACK &amp; GO / EMAIL CONFIRMATION</p>
            <h2>{result?.type === 'success' ? 'You’re all set.' : result?.type === 'error' ? 'Confirmation link issue.' : 'Confirming your email...'}</h2>
            <p role={result?.type === 'error' ? 'alert' : 'status'}>
              {result?.message || 'Please wait while we verify your email address.'}
            </p>
          </div>
          <div className="inline-actions">
            {result?.type === 'success' && isAuthenticated
              ? <Link className="button button-primary" to="/trips">Continue to your trips</Link>
              : <Link className="button button-primary" to="/login">Log in</Link>}
            {result?.type === 'error' && <Link className="button button-quiet" to="/register">Create account</Link>}
          </div>
        </div>
      </div>
    </section>
  )
}
