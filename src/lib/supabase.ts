import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

let cached: SupabaseClient | null | undefined

export function isSupabaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
}

export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    cached = null
    return cached
  }
  cached = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  return cached
}

export function isPlatformOperator(appMetadata: Record<string, unknown> | undefined): boolean {
  return appMetadata?.platform_operator === true
}

export function operatorFromUser(
  user: Pick<User, 'app_metadata' | 'user_metadata'> | null | undefined,
): boolean {
  if (!user) return false
  return isPlatformOperator(user.app_metadata)
}

export type CompanyRow = {
  id: string
  display_name: string
  company_code: string
  registration_status: string
}
