import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { getSupabase } from '../lib/supabase'

type Mode = 'signin' | 'signup'

export function LoginPage() {
  const { configured, user } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const client = getSupabase()
    if (!client) {
      setMessage('중앙 운영이 연결되지 않았습니다.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      if (mode === 'signup') {
        const { error } = await client.auth.signUp({ email: email.trim(), password })
        if (error) throw error
        setMessage('가입 요청을 보냈습니다. 메일 확인이 켜져 있으면 받은편지함을 확인하세요.')
        return
      }
      const { error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error) throw error
      navigate('/')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  if (!configured) {
    return (
      <p className="text-sm text-muted">
        Vercel에 Supabase URL/anon 키가 없습니다. 중앙 로그인을 쓸 수 없습니다.
      </p>
    )
  }

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">로그인</h1>
        <p className="mt-2 text-sm text-muted">
          운영 권한은 계정 프로필이 아니라 서버의 app_metadata로만 부여됩니다.
        </p>
      </div>
      {user ? (
        <p className="text-sm">
          이미 {user.email} 으로 로그인되어 있습니다.{' '}
          <Link className="text-accent underline" to="/">
            홈으로
          </Link>
        </p>
      ) : null}
      <form className="space-y-4 rounded-lg border border-line bg-card p-6" onSubmit={onSubmit}>
        <div className="flex gap-2 text-sm">
          <button
            type="button"
            className={mode === 'signin' ? 'font-semibold text-accent' : 'text-muted'}
            onClick={() => setMode('signin')}
          >
            로그인
          </button>
          <button
            type="button"
            className={mode === 'signup' ? 'font-semibold text-accent' : 'text-muted'}
            onClick={() => setMode('signup')}
          >
            회원가입
          </button>
        </div>
        <label className="block text-sm">
          이메일
          <input
            required
            type="email"
            className="mt-1 w-full rounded border border-line px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          비밀번호
          <input
            required
            minLength={8}
            type="password"
            className="mt-1 w-full rounded border border-line px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {mode === 'signup' ? '가입' : '로그인'}
        </button>
      </form>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </div>
  )
}
