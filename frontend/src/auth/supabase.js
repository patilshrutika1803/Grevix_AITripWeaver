import { createClient } from '@supabase/supabase-js'

let client
export const SUPABASE_CONFIGURATION_ERROR = 'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be configured.'

function getSupabaseConfiguration() {
  const environment = import.meta.env || {}
  const processEnvironment = typeof process === 'undefined' ? {} : process.env
  const supabaseUrl = environment.VITE_SUPABASE_URL || processEnvironment.VITE_SUPABASE_URL
  const supabaseAnonKey = environment.VITE_SUPABASE_ANON_KEY || processEnvironment.VITE_SUPABASE_ANON_KEY

  return { supabaseUrl, supabaseAnonKey }
}

export function isSupabaseConfigured() {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseConfiguration()
  return Boolean(supabaseUrl && supabaseAnonKey)
}

export function getSupabaseClient() {
  if (client) return client
  const { supabaseUrl, supabaseAnonKey } = getSupabaseConfiguration()

  if (!supabaseUrl || !supabaseAnonKey) throw new Error(SUPABASE_CONFIGURATION_ERROR)

  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  })
  return client
}
