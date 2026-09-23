import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useCompanySession } from '../lib/companySession'
import { canConfirmOriginalDevice, savedOnThisDevice, storageLines } from '../lib/data/storageStatus'
import { localDeviceFingerprint } from '../lib/deviceFingerprint'
import { fetchPendingQrInbox } from '../lib/asset/relay'
import { getCompanySqlite } from '../lib/sqlite/instance'
import { getSupabase } from '../lib/supabase'

const sqlite = getCompanySqlite()

export function DataPage() {
  const { configured, loading, user } = useAuth()
  const { companies, companyId } = useCompanySession(Boolean(user))
  const [lines, setLines] = useState<Array<{ label: string; value: string }>>([])
  const [savedHere, setSavedHere] = useState(false)
  const [deviceStatus, setDeviceStatus] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)

  const company = companies.find((row) => row.id === companyId)

  useEffect(() => {
    const client = getSupabase()
    if (!client || !user || !companyId) {
      setReady(true)
      return
    }
    let cancelled = false
    void (async () => {
      let savedHere = false
      let openError = ''
      try {
        await sqlite.open(companyId)
        savedHere = savedOnThisDevice(sqlite.persistOk, sqlite.vfsName)
        if (!savedHere) openError = '이 브라우저에는 원본이 없습니다. 지정 PC의 Chrome에서 초기 설정을 하세요.'
      } catch (error) {
        openError = error instanceof Error ? error.message : String(error)
      }
      const [{ data: device, error: deviceError }, { data: membership, error: membershipError }, inbox] =
        await Promise.all([
          client.from('company_devices').select('status').eq('company_id', companyId).maybeSingle(),
          client
            .from('company_memberships')
            .select('role')
            .eq('company_id', companyId)
            .eq('user_id', user.id)
            .eq('status', 'active')
            .maybeSingle(),
          fetchPendingQrInbox(client, companyId),
        ])
      if (cancelled) return
      if (deviceError) throw new Error(deviceError.message)
      if (membershipError) throw new Error(membershipError.message)
      const status = (device?.status as string | undefined) ?? null
      const admin = membership?.role === 'company_admin'
      setSavedHere(savedHere)
      setDeviceStatus(status)
      setIsAdmin(admin)
      setLines(
        storageLines({
          savedHere,
          deviceStatus: status,
          pendingReceive: inbox.length,
        }),
      )
      setMessage(openError)
      setReady(true)
    })().catch((error: unknown) => {
      if (cancelled) return
      setMessage(error instanceof Error ? error.message : String(error))
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [companyId, user])

  async function confirmThisPc() {
    const client = getSupabase()
    if (!client || !companyId || !canConfirm) return
    setBusy(true)
    setNotice('')
    setMessage('')
    try {
      const fingerprint = await localDeviceFingerprint()
      const { error } = await client.rpc('confirm_company_device', {
        p_company_id: companyId,
        p_device_fingerprint: fingerprint,
      })
      if (error) throw error
      setDeviceStatus('confirmed')
      setLines((current) =>
        current.map((line) => (line.label === '관리자 PC 저장 완료' ? { ...line, value: '예' } : line)),
      )
      setNotice('이 PC를 원본으로 확정했습니다.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const canConfirm = canConfirmOriginalDevice({ savedHere, deviceStatus, isAdmin })

  if (!configured) {
    return <p className="text-sm text-muted">중앙 운영이 연결되지 않았습니다.</p>
  }
  if (loading || (user && !ready)) {
    return <p className="text-sm text-muted">저장 상태를 확인하는 중입니다.</p>
  }
  if (!user) {
    return (
      <p className="text-sm">
        데이터 관리는 로그인한 뒤 봅니다. <Link to="/login">로그인</Link>
      </p>
    )
  }
  if (!companyId) {
    return <p className="text-sm text-muted">연결된 회사가 없습니다.</p>
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">데이터 관리</h1>
        <p className="mt-2 text-sm text-muted">
          {company ? `${company.display_name}의 ` : ''}이 브라우저 저장 상태입니다. 백업과 복원은 열지 않습니다.
        </p>
      </div>
      {message ? <p className="text-sm text-danger">{message}</p> : null}
      {notice ? <p className="text-sm text-ok">{notice}</p> : null}
      <ul className="space-y-2 rounded-lg border border-line bg-card p-6 text-sm">
        {lines.map((line) => (
          <li key={line.label} className="flex items-baseline justify-between gap-4">
            <span>{line.label}</span>
            <span className="text-muted">{line.value}</span>
          </li>
        ))}
      </ul>
      {canConfirm ? (
        <button
          type="button"
          disabled={busy}
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          onClick={() => void confirmThisPc()}
        >
          이 PC를 원본으로 확정
        </button>
      ) : null}
      {savedHere && deviceStatus === 'reserved' && !isAdmin ? (
        <p className="text-sm text-muted">이 PC 확정은 회사 관리자만 할 수 있습니다.</p>
      ) : null}
    </div>
  )
}
