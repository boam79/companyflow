import { useState } from 'react'
import { companyDbFileName } from '../lib/companyPaths'
import { CompanySqlite } from '../lib/sqlite/client'
import {
  canMarkUsable,
  initialSetupState,
  reduceSetup,
  setupLabel,
  type SetupState,
} from '../lib/setupMachine'
import { acquireCompanyWriteLock } from '../lib/tabLock'

const sqlite = new CompanySqlite()

export function DeviceSetupPage() {
  const [companyId, setCompanyId] = useState('demo-a')
  const [state, setState] = useState<SetupState>(initialSetupState())
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  function push(line: string) {
    setLog((prev) => [...prev, line])
  }

  async function runSetup() {
    setBusy(true)
    try {
      let next = reduceSetup(initialSetupState(), { type: 'admin_linked' })
      push('관리자 연결 확인')
      const lock = await acquireCompanyWriteLock(companyId)
      if (!lock.ok) {
        next = reduceSetup(next, {
          type: 'fail',
          reason: '다른 탭이 이 회사 원본을 사용 중입니다.',
        })
        setState(next)
        push(next.reason ?? '잠금 실패')
        return
      }
      try {
        next = reduceSetup(next, { type: 'pc_claimed' })
        push(`원본 장치 예약: ${companyDbFileName(companyId)}`)
        if (navigator.storage?.persist) {
          const persisted = await navigator.storage.persist()
          if (!persisted) {
            push('영속 저장 권한이 거절되었습니다. 실데이터는 시작하지 않습니다.')
          }
        }
        await sqlite.open(companyId)
        if (!sqlite.persistOk) {
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
        const replay = sqlite.operations.run(`setup:${companyId}`, () => 'ok')
        push(`기본 설정 복사 (${replay.status})`)
        next = reduceSetup(next, { type: 'persist_ok' })
        setState(next)
        push(canMarkUsable(next) ? '사용 가능' : '검증 부족')
      } finally {
        lock.release()
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      setState((prev) => reduceSetup(prev, { type: 'fail', reason }))
      push(reason)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">지정 PC 초기 설정</h1>
        <p className="mt-2 text-sm text-muted">
          휴대폰 로그인은 원본 장치로 취급하지 않습니다. 영속 저장이 실패하면 사용 가능으로
          표시하지 않습니다.
        </p>
      </div>
      <div className="rounded-lg border border-line bg-card p-6 space-y-4">
        <p className="text-sm">
          현재 단계: <strong>{setupLabel(state.phase)}</strong>
        </p>
        <label className="block text-sm">
          회사 ID
          <input
            className="mt-1 w-full rounded border border-line px-3 py-2"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value.trim())}
          />
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
