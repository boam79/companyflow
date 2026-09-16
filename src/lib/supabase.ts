import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function getSupabase(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
}

export function isPlatformOperator(appMetadata: Record<string, unknown> | undefined): boolean {
  return appMetadata?.platform_operator === true
}
