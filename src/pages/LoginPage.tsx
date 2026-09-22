import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { safeLoginNext } from '../lib/loginNext'
import { getSupabase } from '../lib/supabase'

export function LoginPage() {
  const { configured, user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSignIn(event: FormEvent) {
    event.preventDefault()
    const client = getSupabase()
    if (!client) {
      setMessage('중앙 운영이 연결되지 않았습니다.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const { error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error) throw error
      navigate(safeLoginNext(searchParams.get('next')))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  async function onSignUp(event: FormEvent) {
    event.preventDefault()
    const client = getSupabase()
    if (!client) {
      setMessage('중앙 운영이 연결되지 않았습니다.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const { data, error } = await client.auth.signUp({
        email: signupEmail.trim(),
        password: signupPassword,
      })
      if (error) throw error
      if (data.session) {
        navigate(safeLoginNext(searchParams.get('next')))
        return
      }
      setMessage('계정을 만들었습니다. 메일 확인이 필요하면 받은편지함을 연 뒤, 위 로그인 칸에서 같은 이메일로 들어오세요.')
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
          계정이 없으면 아래 회원가입에서 만듭니다. 운영 권한은 서버의 app_metadata로만 부여됩니다.
        </p>
      </div>
      {user ? (
        <p className="text-sm">
          이미 {user.email} 으로 로그인되어 있습니다.{' '}
          <Link className="text-accent underline" to={safeLoginNext(searchParams.get('next'))}>
            {safeLoginNext(searchParams.get('next')) === '/' ? '홈으로' : '자산 입력으로'}
          </Link>
        </p>
      ) : null}
      <form className="space-y-4 rounded-lg border border-line bg-card p-6" onSubmit={onSignIn}>
        <h2 className="text-lg font-semibold">로그인</h2>
        <label className="block text-sm">
          이메일
          <input
            required
            type="email"
            name="loginEmail"
            autoComplete="username"
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
            name="loginPassword"
            autoComplete="current-password"
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
          로그인
        </button>
      </form>
      <form className="space-y-4 rounded-lg border border-line bg-card p-6" onSubmit={onSignUp}>
        <h2 className="text-lg font-semibold">회원가입</h2>
        <p className="text-sm text-muted">초대받은 이메일은 여기서 계정을 만듭니다. 만든 뒤 로그인하면 수락이 나옵니다.</p>
        <label className="block text-sm">
          이메일
          <input
            required
            type="email"
            name="signupEmail"
            autoComplete="email"
            className="mt-1 w-full rounded border border-line px-3 py-2"
            value={signupEmail}
            onChange={(e) => setSignupEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          비밀번호
          <input
            required
            minLength={8}
            type="password"
            name="signupPassword"
            autoComplete="new-password"
            className="mt-1 w-full rounded border border-line px-3 py-2"
            value={signupPassword}
            onChange={(e) => setSignupPassword(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          계정 만들기
        </button>
      </form>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </div>
  )
}
