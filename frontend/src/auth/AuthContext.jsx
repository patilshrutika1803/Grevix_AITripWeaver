import { useEffect, useMemo, useRef, useState } from 'react'
import { authApi } from '../api/client'
import { AuthContext } from './context'
import {
  getSupabaseClient,
  isSupabaseConfigured,
  SUPABASE_CONFIGURATION_ERROR,
} from './supabase'

export function AuthProvider({ children }) {
  const supabase = useMemo(
    () => isSupabaseConfigured() ? getSupabaseClient() : null,
    [],
  )
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [isLoading, setIsLoading] = useState(Boolean(supabase))
  const [authError, setAuthError] = useState(supabase ? null : SUPABASE_CONFIGURATION_ERROR)
  const supabaseAuth = supabase?.auth
  const currentAccessToken = useRef(null)
  const currentUserId = useRef(null)
  const loadedUserId = useRef(null)
  const loadedProfile = useRef(null)
  const profileRequest = useRef(null)
  const isMounted = useRef(true)

  const requireSupabase = () => {
    if (!supabase) throw new Error(SUPABASE_CONFIGURATION_ERROR)
    return supabase
  }

  const loadProfile = (session) => {
    const accessToken = session?.access_token
    const userId = session?.user?.id
    if (!accessToken || !userId || accessToken !== currentAccessToken.current || userId !== currentUserId.current) {
      return Promise.resolve(null)
    }
    if (loadedUserId.current === userId) return Promise.resolve(loadedProfile.current)
    if (profileRequest.current?.userId === userId) return profileRequest.current.promise

    const promise = authApi.me()
      .then((profile) => {
        if (isMounted.current && currentUserId.current === userId) {
          loadedUserId.current = userId
          loadedProfile.current = profile
          setUser(profile)
          setAuthError(null)
        }
        return profile
      })
      .catch((error) => {
        if (isMounted.current && currentUserId.current === userId) setAuthError(error.message)
        throw error
      })
      .finally(() => {
        if (profileRequest.current?.promise === promise) profileRequest.current = null
      })
    profileRequest.current = { userId, promise }
    return promise
  }

  useEffect(() => {
    if (!supabaseAuth) return undefined

    let active = true
    isMounted.current = true

    const { data: { subscription } } = supabaseAuth.onAuthStateChange((event, session) => {
      if (!active) return
      setAuthError(null)
      currentAccessToken.current = session?.access_token ?? null
      currentUserId.current = session?.user?.id ?? null
      if (!session) {
        loadedUserId.current = null
        loadedProfile.current = null
      }
      if (!session) setUser(null)
      else if (event !== 'TOKEN_REFRESHED') setUser(session.user)
      setToken(session?.access_token ?? null)
      if (event !== 'INITIAL_SESSION') setIsLoading(false)
      if (session && ['INITIAL_SESSION', 'SIGNED_IN', 'USER_UPDATED'].includes(event)) {
        window.setTimeout(() => {
          if (active) {
            loadProfile(session).catch((error) => {
              if (currentUserId.current === session.user.id) setAuthError(error.message)
            })
          }
        }, 0)
      }
    })

    supabaseAuth.getSession().then(async ({ data, error }) => {
      if (!active) return
      if (error) {
        setAuthError(error.message)
        setIsLoading(false)
        return
      }
      if (currentAccessToken.current === null) {
        currentAccessToken.current = data.session?.access_token ?? null
        currentUserId.current = data.session?.user?.id ?? null
        setUser(data.session?.user ?? null)
        setToken(currentAccessToken.current)
      }
      if (data.session) {
        try {
          await loadProfile(data.session)
        } catch (profileError) {
          if (active && currentUserId.current === data.session.user.id) setAuthError(profileError.message)
        }
      }
      setIsLoading(false)
    }).catch((error) => {
      if (!active) return
      setAuthError(error.message)
      setIsLoading(false)
    })

    return () => {
      active = false
      isMounted.current = false
      subscription.unsubscribe()
    }
  }, [supabaseAuth])

  const login = async ({ email, password }) => {
    const authClient = requireSupabase()
    setIsLoading(true)
    try {
      const { data, error } = await authClient.auth.signInWithPassword({ email, password })
      if (error) throw error
      currentAccessToken.current = data.session?.access_token ?? null
      currentUserId.current = data.session?.user?.id ?? null
      const profile = await loadProfile(data.session)
      setUser(profile)
      return { ...data, user: profile }
    } finally {
      setIsLoading(false)
    }
  }

  const register = async ({ name, email, password }) => {
    const authClient = requireSupabase()
    setIsLoading(true)
    try {
      const { data, error } = await authClient.auth.signUp({
        email,
        password,
        options: { data: { name: name.trim() } },
      })
      if (error) throw error
      if (data.session) {
        currentAccessToken.current = data.session.access_token
        currentUserId.current = data.session.user.id
      }
      const profile = data.session ? await loadProfile(data.session) : data.user
      if (data.session) setUser(profile)
      return { ...data, user: profile, needsEmailConfirmation: !data.session }
    } finally {
      setIsLoading(false)
    }
  }

  const logout = async () => {
    const { error } = await requireSupabase().auth.signOut()
    if (error) throw error
  }

  const requestPasswordReset = async (email) => {
    const { error } = await requireSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/forgot-password`,
    })
    if (error) throw error
    return { message: 'If the account exists, password reset instructions have been sent.' }
  }

  const updatePassword = async (password) => {
    const authClient = requireSupabase()
    const { error } = await authClient.auth.updateUser({ password })
    if (error) throw error
    const { error: signOutError } = await authClient.auth.signOut()
    if (signOutError) throw signOutError
  }

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isAuthenticated: Boolean(user && token),
      isLoading,
      authError,
      login,
      register,
      logout,
      requestPasswordReset,
      updatePassword,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
