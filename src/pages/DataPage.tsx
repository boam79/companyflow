import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useCompanySession } from '../lib/companySession'
import {
  canConfirmOriginalDevice,
  canManageBackup,
  dataPageLead,
  savedOnThisDevice,
  storageLines,
} from '../lib/data/storageStatus'
import { localDeviceFingerprint } from '../lib/deviceFingerprint'
import { fetchPendingQrInbox, publishRelayPublicKey } from '../lib/asset/relay'
import { publicErrorMessage } from '../lib/publicError'
import { getCompanySqlite } from '../lib/sqlite/instance'
import { SCHEMA_VERSION } from '../lib/sqlite/schema'
import { explainSqliteOpenError } from '../lib/sqlite/openError'
import { getSupabase } from '../lib/supabase'
import { generateRelayKeyPair } from '../lib/crypto/ecdh'
import { openBackup, sealBackup } from '../lib/backup/bundle'
import {
  applySnapshot,
  dumpTables,
  readLastBackupAt,
  readRelayPrivateJwk,
  writeLastBackupAt,
  writeRelayPrivateJwk,
} from '../lib/backup/snapshot'

const sqlite = getCompanySqlite()

function backupStamp(iso: string) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso))
}

export function DataPage() {
  const { configured, loading, user, operator } = useAuth()
  const { companies, companyId } = useCompanySession(Boolean(user), user?.id ?? '')
  const [lines, setLines] = useState<Array<{ label: string; value: string }>>([])
  const [savedHere, setSavedHere] = useState(false)
  const [deviceStatus, setDeviceStatus] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [hasRelayKey, setHasRelayKey] = useState(false)
  const [passphrase, setPassphrase] = useState('')
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const restoreFile = useRef<HTMLInputElement>(null)

  const company = companies.find((row) => row.id === companyId)
  const manageBackup = canManageBackup({ savedHere, isAdmin })

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
        openError = explainSqliteOpenError(error)
      }
      const [{ data: device, error: deviceError }, { data: membership, error: membershipError }, inbox, lastBackup, privateJwk] =
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
          savedHere ? readLastBackupAt(sqlite) : Promise.resolve(''),
          savedHere ? readRelayPrivateJwk(sqlite) : Promise.resolve(null),
        ])
      if (cancelled) return
      if (deviceError) throw new Error(deviceError.message)
      if (membershipError) throw new Error(membershipError.message)
      const status = (device?.status as string | undefined) ?? null
      const admin = operator || membership?.role === 'company_admin'
      setSavedHere(savedHere)
      setDeviceStatus(status)
      setIsAdmin(admin)
      setHasRelayKey(Boolean(privateJwk))
      setLines(
        storageLines({
          savedHere,
          deviceStatus: status,
          pendingReceive: inbox.filter((row) => !row.expired).length,
          lastBackupAt: lastBackup ? backupStamp(lastBackup) : undefined,
        }),
      )
      setMessage(openError)
      setReady(true)
    })().catch((error: unknown) => {
      if (cancelled) return
      setMessage(publicErrorMessage(error))
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [companyId, operator, user])

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
      setMessage(publicErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function makeRelayKey() {
    const client = getSupabase()
    if (!client || !companyId || !manageBackup) return
    setBusy(true)
    setNotice('')
    setMessage('')
    try {
      const keys = await generateRelayKeyPair()
      await writeRelayPrivateJwk(sqlite, keys.privateJwk)
      await publishRelayPublicKey(client, companyId, keys.publicJwk)
      setHasRelayKey(true)
      setNotice('스마트폰 수신 키를 이 PC에 만들었습니다. 비밀키는 이 브라우저 원본에만 있습니다.')
    } catch (error) {
      setMessage(publicErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function downloadBackup() {
    if (!manageBackup || !companyId) return
    setBusy(true)
    setNotice('')
    setMessage('')
    try {
      const dumpedAt = new Date().toISOString()
      const header = await sealBackup({
        passphrase,
        snapshot: {
          companyId,
          schemaVersion: SCHEMA_VERSION,
          dumpedAt,
          tables: await dumpTables(sqlite),
        },
      })
      const blob = new Blob([JSON.stringify(header)], { type: 'application/octet-stream' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `companyflow-${company?.company_code ?? 'backup'}-${dumpedAt.slice(0, 10)}.cfbak`
      link.click()
      URL.revokeObjectURL(link.href)
      await writeLastBackupAt(sqlite, dumpedAt)
      setLines((current) => {
        const next = current.filter((line) => line.label !== '최근 백업')
        next.push({ label: '최근 백업', value: backupStamp(dumpedAt) })
        return next
      })
      setNotice('암호화한 원본 묶음을 받았습니다. 암호는 저장하지 않았습니다.')
    } catch (error) {
      setMessage(publicErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function restoreBackup(file: File | null) {
    if (!file || !manageBackup || !companyId) return
    setBusy(true)
    setNotice('')
    setMessage('')
    try {
      const snapshot = await openBackup({
        passphrase,
        fileText: await file.text(),
        openCompanyId: companyId,
        currentSchemaVersion: SCHEMA_VERSION,
      })
      await applySnapshot(sqlite, snapshot)
      await writeLastBackupAt(sqlite, new Date().toISOString())
      setNotice('백업을 되돌렸습니다. 잘못된 파일이면 적용하지 않고 현재 원본을 남깁니다.')
    } catch (error) {
      setMessage(publicErrorMessage(error))
    } finally {
      setBusy(false)
      if (restoreFile.current) restoreFile.current.value = ''
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
        <p className="mt-2 text-sm text-muted">{dataPageLead(company?.display_name)}</p>
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
      {manageBackup ? (
        <section className="space-y-3 rounded-lg border border-line bg-card p-6">
          <h2 className="text-base font-semibold">원본 묶음</h2>
          <p className="text-sm text-muted">
            암호는 이 PC에 남기지 않습니다. 틀린 암호·다른 회사 파일은 현재 원본을 바꾸지 않습니다. 중앙 서버에는 평문 원본을
            올리지 않습니다.
          </p>
          <label className="block text-sm">
            묶음 암호
            <input
              type="password"
              autoComplete="new-password"
              className="mt-1 w-full rounded border border-line px-3 py-2"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={() => void downloadBackup()}
            >
              암호화 묶음 받기
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded border border-line px-4 py-2 text-sm disabled:opacity-50"
              onClick={() => restoreFile.current?.click()}
            >
              묶음 되돌리기
            </button>
            <input
              ref={restoreFile}
              type="file"
              accept=".cfbak,application/json"
              className="hidden"
              onChange={(event) => void restoreBackup(event.target.files?.[0] ?? null)}
            />
          </div>
          {hasRelayKey ? (
            <p className="text-sm text-muted">스마트폰 수신 키가 이 원본에 있습니다.</p>
          ) : (
            <button
              type="button"
              disabled={busy}
              className="rounded border border-line px-4 py-2 text-sm disabled:opacity-50"
              onClick={() => void makeRelayKey()}
            >
              스마트폰 수신 키 만들기
            </button>
          )}
        </section>
      ) : null}
    </div>
  )
}
