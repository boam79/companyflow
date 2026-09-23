import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { COMPANY_ASSET_ITEMS, loadItems } from '../lib/master/book'
import { loadQrAssetDetail, phoneQrSavedMessage, type QrAssetDetail } from '../lib/asset/qrLookup'
import { preventImeEnterSubmit } from '../lib/asset/hangulIme'
import { executeQrRegistration, readQrAssetForm } from '../lib/asset/register'
import { fetchQrLabel, submitAssetQr, type AssetQrLabelRow } from '../lib/asset/relay'
import { isQrLabelId, sqliteIdForQrLabel } from '../lib/asset/qr'
import { readCompanyModule } from '../lib/company/moduleAccess'
import { ModuleClosed } from '../components/ModuleClosed'
import { GUEST_COMPANY_ID } from '../lib/guest/ids'
import { useWorkAccess } from '../lib/guest/workAccess'
import { getSupabase } from '../lib/supabase'

export function QrScanPage() {
  const { token = '' } = useParams()
  const { guest, sqlite, href, setCompanyId } = useWorkAccess()
  const { configured, loading, user, operator } = useAuth()
  const [label, setLabel] = useState<AssetQrLabelRow | null>(null)
  const [detail, setDetail] = useState<QrAssetDetail | null>(null)
  const [itemOptions, setItemOptions] = useState(COMPANY_ASSET_ITEMS)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [formTick, setFormTick] = useState(0)
  const [moduleOff, setModuleOff] = useState(false)

  useEffect(() => {
    if (!guest && !user) return
    setMessage('')
    setDetail(null)
    setNotice('')
    setModuleOff(false)
    let cancelled = false
    void (async () => {
      try {
        if (guest) {
          if (!isQrLabelId(token)) {
            setLabel(null)
            setMessage('이 QR은 샘플에서 만든 빈 QR이 아닙니다.')
            return
          }
          if (!sqlite.isOpen(GUEST_COMPANY_ID)) {
            setLabel(null)
            setMessage('샘플을 연 뒤에 QR을 읽으세요.')
            return
          }
          if (!sqlite.persistOk) return
          const rows = await sqlite.query<{
            id: string
            status: 'blank' | 'bound'
            created_at: string
          }>('select id, status, created_at from qr_labels where id = ?', [token])
          const row = rows[0]
          if (cancelled) return
          if (!row) {
            setLabel(null)
            setMessage('이 QR은 샘플에서 만든 빈 QR이 아닙니다.')
            return
          }
          setLabel({
            id: row.id,
            company_id: GUEST_COMPANY_ID,
            status: row.status === 'bound' ? 'imported' : 'blank',
            created_at: row.created_at,
          })
          const items = await loadItems(sqlite)
          const options = COMPANY_ASSET_ITEMS.filter((item) => items.some((row) => row.id === item.id))
          setItemOptions(options.length ? options : COMPANY_ASSET_ITEMS)
          const local = await loadQrAssetDetail(sqlite, token, items)
          if (cancelled) return
          if (local) {
            setDetail(local)
            setMessage('')
          }
          return
        }

        const client = getSupabase()
        if (!client) return
        const row = await fetchQrLabel(client, token)
        if (cancelled) return
        setLabel(row)
        if (!row) {
          setMessage('이 QR은 회사 PC에서 만든 빈 QR이 아닙니다.')
          return
        }
        const companyId = sqliteIdForQrLabel(row.company_id)
        if (!companyId) {
          setMessage('이 QR의 회사 원본을 열 수 없습니다.')
          return
        }
        if (!user) {
          setMessage('이 QR의 회사에 연결된 계정만 원본을 엽니다.')
          return
        }
        const { data: member } = await client
          .from('company_memberships')
          .select('company_id')
          .eq('user_id', user.id)
          .eq('company_id', companyId)
          .eq('status', 'active')
          .maybeSingle()
        if (!member && !operator) {
          setMessage('이 QR의 회사에 연결된 계정만 원본을 엽니다.')
          return
        }
        setCompanyId(companyId)
        await sqlite.open(companyId)
        if (!sqlite.persistOk) return
        if (!(await readCompanyModule(sqlite, companyId, 'assets'))) {
          if (!cancelled) setModuleOff(true)
          return
        }
        const items = await loadItems(sqlite)
        setItemOptions(COMPANY_ASSET_ITEMS)
        const local = await loadQrAssetDetail(sqlite, token, items)
        if (cancelled) return
        if (local) {
          setDetail(local)
          setMessage('')
        }
      } catch (error) {
        if (cancelled) return
        const text = error instanceof Error ? error.message : String(error)
        if (/다른 탭/.test(text)) {
          setMessage('다른 탭이 이 회사 원본을 사용 중입니다. 그 탭을 닫거나, 자산 화면에서 QR로 상세 보기를 누르세요.')
          return
        }
        if (/invalid input syntax for type uuid/i.test(text)) {
          setMessage(guest ? '이 QR은 샘플에서 만든 빈 QR이 아닙니다.' : '이 QR은 회사 PC에서 만든 빈 QR이 아닙니다.')
          return
        }
        if (/영속|OPFS|지정 Chrome|초기 설정/i.test(text)) return
        setMessage((prev) => prev || text)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, user, guest, sqlite])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    setNotice('')
    try {
      const payload = readQrAssetForm(new FormData(event.currentTarget))
      if (guest) {
        const result = await executeQrRegistration(sqlite, { labelId: token, payload })
        const items = await loadItems(sqlite)
        const local = await loadQrAssetDetail(sqlite, token, items)
        setDetail(local)
        setLabel((prev) => (prev ? { ...prev, status: 'imported' } : prev))
        setNotice(
          result.status === 'duplicate'
            ? '이미 샘플에 저장된 QR입니다.'
            : '샘플에 저장했습니다. 지정 PC 원본은 건드리지 않습니다.',
        )
        setFormTick((tick) => tick + 1)
        return
      }
      const client = getSupabase()
      if (!client) {
        setMessage('중앙 운영이 연결되지 않았습니다.')
        return
      }
      if (sqlite.persistOk && !(await readCompanyModule(sqlite, sqlite.companyId, 'assets'))) {
        setModuleOff(true)
        return
      }
      await submitAssetQr(client, token, payload)
      setLabel((prev) => (prev ? { ...prev, status: 'submitted' } : prev))
      setNotice('저장했습니다. 지정 PC 자산 화면에서 원본에 반영됩니다.')
      setFormTick((tick) => tick + 1)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  if (!guest && loading) return <p className="text-sm text-muted">세션을 확인하는 중입니다.</p>
  if (!guest && !configured) return <p className="text-sm text-muted">중앙 운영이 연결되지 않았습니다.</p>
  if (!guest && moduleOff) return <ModuleClosed title="자산" />
  if (!guest && !user) {
    return (
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-semibold">자산 정보 입력</h1>
        <p className="text-sm text-muted">빈 QR을 읽었습니다. 로그인 후 가구·컴퓨터 정보를 넣으세요.</p>
        <Link className="inline-block rounded bg-accent px-4 py-2 text-sm font-semibold text-white" to={`/login?next=/q/${token}`}>
          로그인
        </Link>
      </div>
    )
  }

  if (detail) {
    return (
      <div className="max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">
            {detail.itemName} · {detail.assetNumber}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {guest
              ? '샘플입니다. 지정 PC 원본은 건드리지 않습니다. 직원에게 배정하지 않습니다.'
              : '지정 PC 원본입니다. 직원에게 배정하지 않습니다.'}
          </p>
        </div>
        {notice ? <p className="text-sm text-ok">{notice}</p> : null}
        <dl className="space-y-2 rounded-lg border border-line bg-card p-5 text-sm">
          <div>
            <dt className="text-muted">상태</dt>
            <dd className="font-medium">{detail.statusLabel}</dd>
          </div>
          <div>
            <dt className="text-muted">위치</dt>
            <dd>{detail.locationText || '—'}</dd>
          </div>
          <div>
            <dt className="text-muted">부서</dt>
            <dd>{detail.departmentName || '—'}</dd>
          </div>
          <div>
            <dt className="text-muted">담당</dt>
            <dd>{detail.ownerName || '—'}</dd>
          </div>
          <div>
            <dt className="text-muted">모델 · 일련번호</dt>
            <dd>{[detail.model, detail.serialNo].filter(Boolean).join(' · ') || '—'}</dd>
          </div>
          <div>
            <dt className="text-muted">취득</dt>
            <dd>{detail.acquiredAt || '—'}</dd>
          </div>
        </dl>
        <section>
          <h2 className="text-sm font-semibold">이력 {detail.history.length}</h2>
          {detail.history.length ? (
            <ul className="mt-2 space-y-2 text-sm">
              {detail.history.map((line, index) => (
                <li key={`${index}:${line}`} className="border-b border-line/70 py-2">
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">이력이 없습니다.</p>
          )}
        </section>
        <Link className="inline-block text-sm text-accent underline" to={href('/assets')}>
          자산 화면에서 이관·수리·폐기
        </Link>
      </div>
    )
  }

  const canSave = label?.status === 'blank' && !notice

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">자산 정보 입력</h1>
        <p className="mt-2 text-sm text-muted">
          {guest
            ? '샘플 빈 QR입니다. 자산번호를 넣지 않습니다. 이 화면에서 품목·위치만 넣고 바로 샘플 자산으로 확인합니다.'
            : '빈 QR에 자산번호를 넣지 않습니다. 품목·모델·일련번호·위치·부서·담당자·취득일을 입력해 저장하세요.'}
        </p>
      </div>
      {notice ? <p className="text-sm text-ok">{notice}</p> : null}
      {message ? <p className="text-sm text-danger">{message}</p> : null}
      {!canSave && label && label.status !== 'blank' ? (
        <p className="text-sm text-muted">{phoneQrSavedMessage(guest)}</p>
      ) : null}
      {canSave ? (
        <form
          key={formTick}
          className="space-y-3 rounded-lg border border-line bg-card p-5"
          lang="ko"
          onKeyDown={preventImeEnterSubmit}
          onSubmit={onSubmit}
        >
          <label className="block text-sm">
            품목
            <select name="itemName" className="mt-1 w-full rounded border border-line px-3 py-2" defaultValue={itemOptions[0]?.name ?? '책상'}>
              {itemOptions.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            모델
            <input name="model" autoComplete="off" className="mt-1 w-full rounded border border-line px-3 py-2" defaultValue="" />
          </label>
          <label className="block text-sm">
            일련번호
            <input name="serialNo" autoComplete="off" className="mt-1 w-full rounded border border-line px-3 py-2" defaultValue="" />
          </label>
          <label className="block text-sm">
            위치
            <input name="location" required autoComplete="off" className="mt-1 w-full rounded border border-line px-3 py-2" defaultValue="" />
          </label>
          <label className="block text-sm">
            부서
            <input name="departmentName" autoComplete="off" className="mt-1 w-full rounded border border-line px-3 py-2" defaultValue="" />
          </label>
          <label className="block text-sm">
            담당자
            <input name="ownerName" autoComplete="off" className="mt-1 w-full rounded border border-line px-3 py-2" defaultValue="" />
          </label>
          <label className="block text-sm">
            취득일
            <input type="date" name="acquiredAt" className="mt-1 w-full rounded border border-line px-3 py-2" defaultValue="" />
          </label>
          <button type="submit" disabled={busy} className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            저장
          </button>
        </form>
      ) : null}
    </div>
  )
}
