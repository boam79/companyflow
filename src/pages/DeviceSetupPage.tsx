import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { companyDbFileName } from '../lib/companyPaths'
import { localDeviceFingerprint } from '../lib/deviceFingerprint'
import { getCompanySqlite } from '../lib/sqlite/instance'
import {
  canMarkUsable,
  initialSetupState,
  reduceSetup,
  setupLabel,
  type SetupState,
} from '../lib/setupMachine'
import { CompanyMasterBook, seedDefaultMaster, writeDefaultMaster } from '../lib/master/book'
import { canStartRealData } from '../lib/sqlite/durableStore'
import { getSupabase, type CompanyRow } from '../lib/supabase'

const sqlite = getCompanySqlite()

export function DeviceSetupPage() {
  const { configured, loading, user, operator } = useAuth()
  const [companyId, setCompanyId] = useState('')
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [state, setState] = useState<SetupState>(initialSetupState())
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    const client = getSupabase()
    if (!client) return
    let cancelled = false
    void client
      .from('companies')
      .select('id, display_name, company_code, registration_status')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled || !data?.length) return
        setCompanies(data as CompanyRow[])
        setCompanyId((prev) => prev || data[0].id)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  function push(line: string) {
    setLog((prev) => [...prev, line])
  }

  async function runSetup() {
    setBusy(true)
    try {
      let next = reduceSetup(initialSetupState(), { type: 'admin_linked' })
      push(operator ? '운영 권한으로 장치 예약을 시도합니다' : '관리자 연결 확인')
      const client = getSupabase()
      if (client && companyId) {
        const fingerprint = await localDeviceFingerprint()
        const { error } = await client.rpc('claim_company_device', {
          p_company_id: companyId,
          p_device_fingerprint: fingerprint,
        })
        if (error) {
          next = reduceSetup(next, { type: 'fail', reason: error.message })
          setState(next)
          push(error.message)
          return
        }
        push('중앙에 원본 장치를 예약했습니다')
      }
      next = reduceSetup(next, { type: 'pc_claimed' })
      push(`원본 장치 예약: ${companyDbFileName(companyId)}`)
      let persistGranted = false
      if (navigator.storage?.persist) {
        persistGranted = await navigator.storage.persist()
        if (!persistGranted) {
          push(
            'Chrome 저장소 영속 권한은 아직 꺼져 있습니다. OPFS 파일이 열리면 계속 진행합니다. 이 사이트를 북마크하면 권한이 잘 붙습니다.',
          )
        }
      }
      await sqlite.open(companyId, { force: true })
      push(`로컬 VFS: ${sqlite.vfsName}`)
      if (!canStartRealData({ opfsOpen: sqlite.persistOk, persistGranted })) {
        next = reduceSetup(next, {
          type: 'fail',
          reason: 'OPFS 영속 DB를 열 수 없습니다.',
        })
        setState(next)
        push(next.reason ?? '')
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
      const replay = sqlite.operations.run(`setup:${companyId}`, () => 'ok')
      push(`기본 설정 복사 (${replay.status})`)
      if (client) {
        const fingerprint = await localDeviceFingerprint()
        const { error } = await client.rpc('confirm_company_device', {
          p_company_id: companyId,
          p_device_fingerprint: fingerprint,
        })
        if (error) {
          push(`원본 장치 확정은 보류했습니다: ${error.message}`)
        } else {
          push('중앙에 원본 장치를 확정했습니다')
        }
      }
      next = reduceSetup(next, { type: 'persist_ok' })
      setState(next)
      push(canMarkUsable(next) ? '사용 가능' : '검증 부족')
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      setState((prev) => reduceSetup(prev, { type: 'fail', reason }))
      push(reason)
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

  if (!user) {
    return (
      <p className="text-sm">
        지정 PC 설정은 로그인 후 진행합니다.{' '}
        <Link className="text-accent underline" to="/login">
          로그인
        </Link>
      </p>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">지정 PC 초기 설정</h1>
        <p className="mt-2 text-sm text-muted">
          휴대폰 로그인은 원본 장치로 취급하지 않습니다. OPFS 파일이 열리지 않으면 사용 가능으로
          표시하지 않습니다.
        </p>
      </div>
      <div className="rounded-lg border border-line bg-card p-6 space-y-4">
        <p className="text-sm">
          현재 단계: <strong>{setupLabel(state.phase)}</strong>
        </p>
        <label className="block text-sm">
          회사
          {companies.length > 0 ? (
            <select
              className="mt-1 w-full rounded border border-line px-3 py-2"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.display_name} ({company.company_code})
                </option>
              ))}
            </select>
          ) : (
            <input
              className="mt-1 w-full rounded border border-line px-3 py-2"
              placeholder="회사 UUID"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value.trim())}
            />
          )}
        </label>
        <button
          type="button"
          disabled={busy || !companyId}
          onClick={() => void runSetup()}
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          이 PC를 업무 원본 장치로 설정
        </button>
        {state.reason ? <p className="text-sm text-danger">{state.reason}</p> : null}
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
          {log.map((line, index) => (
            <li key={`${index}-${line}`}>{line}</li>
          ))}
        </ol>
      </div>
    </div>
  )
}
