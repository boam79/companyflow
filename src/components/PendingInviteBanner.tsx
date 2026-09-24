import { useEffect, useState } from 'react'
import { getSupabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { afterInviteAcceptHref } from '../lib/invite'

type PendingInvite = {
  id: string
  display_name: string
  role: string
}

export function PendingInviteBanner() {
  const { user } = useAuth()
  const [rows, setRows] = useState<PendingInvite[]>([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    const client = getSupabase()
    if (!client || !user) {
      setRows([])
      return
    }
    let cancelled = false
    void client.rpc('list_my_company_invitations').then(({ data, error }) => {
      if (cancelled || error) return
      setRows((data ?? []) as PendingInvite[])
    })
    return () => {
      cancelled = true
    }
  }, [user])

  if (!user || rows.length === 0) return null

  async function accept(id: string) {
    const client = getSupabase()
    if (!client) return
    setMessage('')
    const { error } = await client.rpc('accept_company_invitation', { p_invitation_id: id })
    if (error) {
      setMessage(error.message)
      return
    }
    setRows((prev) => prev.filter((row) => row.id !== id))
    setMessage('초대를 수락했습니다. 이 회사 업무를 열 수 있습니다.')
    window.location.assign(afterInviteAcceptHref())
  }

  return (
    <div className="mx-auto w-full max-w-[92rem] px-5 pt-4 text-ink">
      <div className="rounded border border-line bg-card px-4 py-3 text-sm">
      {rows.map((row) => (
        <div key={row.id} className="flex flex-wrap items-center justify-between gap-3">
          <p>
            <strong>{row.display_name}</strong> 초대가 있습니다. 수락하면{' '}
            {row.role === 'company_admin' ? '회사 관리자' : '사용자'}로 연결됩니다.
          </p>
          <button
            type="button"
            className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-white"
            onClick={() => void accept(row.id)}
          >
            수락
          </button>
        </div>
      ))}
      {message ? <p className="mt-2 text-muted">{message}</p> : null}
      </div>
    </div>
  )
}
