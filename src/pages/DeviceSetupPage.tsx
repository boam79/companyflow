import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { WorkGateNotice } from '../components/WorkGateNotice'
import { useAuth } from '../lib/AuthContext'
import { workSessionKind } from '../lib/company/workGate'
import { localDeviceFingerprint } from '../lib/deviceFingerprint'
import { getCompanySqlite } from '../lib/sqlite/instance'
import {
  canMarkUsable,
  initialSetupState,
  reduceSetup,
  setupFromStoredPhase,
  setupLabel,
  setupNeedsSqliteOpen,
  setupRunButtonVisible,
  setupCardLead,
  setupStartHref,
  setupStartLabel,
  type SetupState,
} from '../lib/setupMachine'
import { CompanyMasterBook, seedDefaultMaster, writeDefaultMaster } from '../lib/master/book'
import { canStartRealData } from '../lib/sqlite/durableStore'
import { useCompanySession } from '../lib/companySession'
import { publicErrorMessage } from '../lib/publicError'
import { getSupabase } from '../lib/supabase'

const sqlite = getCompanySqlite()

export function DeviceSetupPage() {
  const { configured, loading, user } = useAuth()
  const { companies, companyId, setCompanyId, ready: sessionReady } = useCompanySession(
    Boolean(user),
    user?.id ?? '',
  )
  const [state, setState] = useState<SetupState>(initialSetupState())
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    setHydrated(false)
    void (async () => {
      if (setupNeedsSqliteOpen(sqlite.isOpen(companyId))) {
        await sqlite.open(companyId)
      }
      const rows = await sqlite.query<{ value: string }>('select value from setup_state where key = ?', ['phase'])
      if (cancelled) return
      const stored = setupFromStoredPhase(rows[0]?.value)
      if (canMarkUsable(stored)) {
        setState(stored)
        setNotice('')
      }
      setHydrated(true)
    })().catch(() => {
      if (!cancelled) setHydrated(true)
    })
    return () => {
      cancelled = true
    }
  }, [companyId])

  async function runSetup() {
    setBusy(true)
    setNotice('')
    try {
      let next = reduceSetup(initialSetupState(), { type: 'admin_linked' })
      const client = getSupabase()
      if (client && companyId) {
        const fingerprint = await localDeviceFingerprint()
        const { error } = await client.rpc('claim_company_device', {
          p_company_id: companyId,
          p_device_fingerprint: fingerprint,
        })
        if (error) {
          next = reduceSetup(next, { type: 'fail', reason: publicErrorMessage(error) })
          setState(next)
          return
        }
      }
      next = reduceSetup(next, { type: 'pc_claimed' })
      let persistGranted = false
      if (navigator.storage?.persist) {
        persistGranted = await navigator.storage.persist()
      }
      if (setupNeedsSqliteOpen(sqlite.isOpen(companyId))) {
        await sqlite.open(companyId)
      }
      if (!canStartRealData({ opfsOpen: sqlite.persistOk, persistGranted })) {
        next = reduceSetup(next, {
          type: 'fail',
          reason: '이 PC에서 원본 파일을 열 수 없습니다. 다른 CompanyFlow 창을 닫고 다시 누르세요.',
        })
        setState(next)
        return
      }
      await sqlite.exec(
        'insert or replace into setup_state(key, value) values(?, ?), (?, ?)',
        ['phase', 'ready', 'copied_default_config', '1'],
      )
      const book = new CompanyMasterBook(companyId)
      seedDefaultMaster(book)
      await writeDefaultMaster(sqlite)
      for (const field of book.fields.values()) {
        await sqlite.exec(
          'insert or replace into custom_field_defs(entity, key, label) values(?, ?, ?)',
          [field.entity, field.key, field.label],
        )
      }
      sqlite.operations.run(`setup:${companyId}`, () => 'ok')
      if (client) {
        const fingerprint = await localDeviceFingerprint()
        const { error } = await client.rpc('confirm_company_device', {
          p_company_id: companyId,
          p_device_fingerprint: fingerprint,
        })
        if (error) {
          next = reduceSetup(next, { type: 'persist_ok' })
          setState(next)
          setNotice('이 PC 원본은 열렸습니다. 중앙 장치 확정은 나중에 다시 눌러 주세요.')
          return
        }
      }
      next = reduceSetup(next, { type: 'persist_ok' })
      setState(next)
      setNotice(canMarkUsable(next) ? '' : '검증이 부족합니다. 다시 눌러 주세요.')
    } catch (error) {
      const reason = publicErrorMessage(error)
      setState((prev) => reduceSetup(prev, { type: 'fail', reason }))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-muted">세션을 확인하는 중입니다.</p>
  }

  if (!configured) {
    return (
      <p className="text-sm text-muted">
        중앙 프로젝트가 연결되지 않아 장치 예약을 서버에 기록할 수 없습니다.
      </p>
    )
  }

  const gated = workSessionKind({
    guest: false,
    signedIn: Boolean(user),
    ready: sessionReady,
    companyId,
  })
  if (gated !== 'ok') {
    return (
      <WorkGateNotice
        guest={false}
        signedIn={Boolean(user)}
        ready={sessionReady}
        companyId={companyId}
        loginHint="지정 PC 설정은 로그인 후 진행합니다."
      />
    )
  }

  const usable = canMarkUsable(state)
  const company = companies.find((row) => row.id === companyId)

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">지정 PC 초기 설정</h1>
        <p className="mt-2 text-sm text-muted">{setupCardLead(usable)}</p>
      </div>
      <div className="space-y-4 rounded-lg border border-line bg-card p-6">
        <p className="text-sm">
          현재 단계: <strong>{hydrated ? setupLabel(state.phase) : '확인 중'}</strong>
        </p>
        {usable && company ? (
          <p className="text-sm">
            회사 <strong>{company.display_name}</strong> ({company.company_code})
          </p>
        ) : (
          <label className="block text-sm">
            회사
            <select
              className="mt-1 w-full rounded border border-line px-3 py-2"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              {companies.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.display_name} ({row.company_code})
                </option>
              ))}
            </select>
          </label>
        )}
        {hydrated && setupRunButtonVisible(usable) ? (
          <button
            type="button"
            disabled={busy || !companyId}
            onClick={() => void runSetup()}
            className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            이 PC를 업무 원본 장치로 설정
          </button>
        ) : null}
        {hydrated && usable ? (
          <Link
            to={setupStartHref()}
            className="inline-flex rounded bg-accent px-4 py-2 text-sm font-semibold text-white"
          >
            {setupStartLabel()}
          </Link>
        ) : null}
        {state.reason ? <p className="text-sm text-danger">{state.reason}</p> : null}
        {notice ? <p className="text-sm text-ok">{notice}</p> : null}
      </div>
    </div>
  )
}
