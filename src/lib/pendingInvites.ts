import { useEffect, useState } from 'react'
import { afterInviteAcceptHref } from './invite'
import { getSupabase } from './supabase'

export type PendingInvite = {
  id: string
  display_name: string
  role: string
}

export function usePendingInvites(enabled: boolean) {
  const [rows, setRows] = useState<PendingInvite[]>([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    const client = getSupabase()
    if (!client || !enabled) {
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
  }, [enabled])

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
    window.location.assign(afterInviteAcceptHref())
  }

  return { rows, message, accept }
}
