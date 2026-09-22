import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useCompanySession } from '../lib/companySession'
import { savedOnThisDevice, storageLines } from '../lib/data/storageStatus'
import { fetchPendingQrInbox } from '../lib/asset/relay'
import { getCompanySqlite } from '../lib/sqlite/instance'
import { getSupabase } from '../lib/supabase'

const sqlite = getCompanySqlite()

export function DataPage() {
  const { configured, loading, user } = useAuth()
  const { companies, companyId } = useCompanySession(Boolean(user))
  const [lines, setLines] = useState<Array<{ label: string; value: string }>>([])
  const [message, setMessage] = useState('')
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
      const [{ data: device, error: deviceError }, inbox] = await Promise.all([
        client.from('company_devices').select('status').eq('company_id', companyId).maybeSingle(),
        fetchPendingQrInbox(client, companyId),
      ])
      if (cancelled) return
      if (deviceError) throw new Error(deviceError.message)
      setLines(
        storageLines({
          savedHere,
          deviceStatus: (device?.status as string | undefined) ?? null,
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
      <ul className="space-y-2 rounded-lg border border-line bg-card p-6 text-sm">
        {lines.map((line) => (
          <li key={line.label} className="flex items-baseline justify-between gap-4">
            <span>{line.label}</span>
            <span className="text-muted">{line.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
