import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabase, operatorFromUser } from './supabase'

type AuthValue = {
  loading: boolean
  session: Session | null
  user: User | null
  operator: boolean
  configured: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => getSupabase(), [])
  const [loading, setLoading] = useState(Boolean(client))
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    if (!client) {
      setLoading(false)
      return
    }
    let cancelled = false
    void client.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setSession(data.session)
        setLoading(false)
      }
    })
    const { data } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }, [client])

  const value = useMemo<AuthValue>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      operator: operatorFromUser(session?.user ?? null),
      configured: Boolean(client),
      signOut: async () => {
        await client?.auth.signOut()
      },
    }),
    [client, loading, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth는 AuthProvider 안에서만 사용합니다.')
  return ctx
}
