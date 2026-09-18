import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { COMPANY_ASSET_ITEMS } from '../lib/master/book'
import { assertQrAssetPayload, type QrAssetPayload } from '../lib/asset/register'
import { fetchQrLabel, submitAssetQr, type AssetQrLabelRow } from '../lib/asset/relay'
import { getSupabase } from '../lib/supabase'

const EMPTY: QrAssetPayload = {
  itemName: COMPANY_ASSET_ITEMS[0]?.name ?? '책상',
  model: '',
  serialNo: '',
  location: '',
  departmentName: '',
  ownerName: '',
  acquiredAt: '',
}

export function QrScanPage() {
  const { token = '' } = useParams()
  const { configured, loading, user } = useAuth()
  const [label, setLabel] = useState<AssetQrLabelRow | null>(null)
  const [form, setForm] = useState<QrAssetPayload>(EMPTY)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    const client = getSupabase()
    if (!client) return
    setMessage('')
    void fetchQrLabel(client, token)
      .then((row) => {
        setLabel(row)
        if (!row) setMessage('이 QR은 회사 PC에서 만든 빈 QR이 아닙니다.')
        else if (row.status !== 'blank') setMessage('이미 저장된 QR입니다. 지정 PC에서 원본에 반영합니다.')
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : String(error)))
  }, [token, user])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const client = getSupabase()
    if (!client) {
      setMessage('중앙 운영이 연결되지 않았습니다.')
      return
    }
    setBusy(true)
    setMessage('')
    setNotice('')
    try {
      const payload = assertQrAssetPayload(form)
      await submitAssetQr(client, token, payload)
      setLabel((prev) => (prev ? { ...prev, status: 'submitted' } : prev))
      setNotice('저장했습니다. 지정 PC 자산 화면에서 원본에 반영됩니다.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="text-sm text-muted">세션을 확인하는 중입니다.</p>
  if (!configured) return <p className="text-sm text-muted">중앙 운영이 연결되지 않았습니다.</p>
  if (!user) {
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

  const canSave = label?.status === 'blank' && !notice

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">자산 정보 입력</h1>
        <p className="mt-2 text-sm text-muted">
          빈 QR에 자산번호를 넣지 않습니다. 품목·모델·일련번호·위치·부서·담당자·취득일을 입력해 저장하세요.
        </p>
      </div>
      {notice ? <p className="text-sm text-ok">{notice}</p> : null}
      {message ? <p className="text-sm text-danger">{message}</p> : null}
      {canSave ? (
        <form className="space-y-3 rounded-lg border border-line bg-card p-5" onSubmit={onSubmit}>
          <label className="block text-sm">
            품목
            <select
              className="mt-1 w-full rounded border border-line px-3 py-2"
              value={form.itemName}
              onChange={(e) => setForm((prev) => ({ ...prev, itemName: e.target.value }))}
            >
              {COMPANY_ASSET_ITEMS.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            모델
            <input
              className="mt-1 w-full rounded border border-line px-3 py-2"
              value={form.model}
              onChange={(e) => setForm((prev) => ({ ...prev, model: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            일련번호
            <input
              className="mt-1 w-full rounded border border-line px-3 py-2"
              value={form.serialNo}
              onChange={(e) => setForm((prev) => ({ ...prev, serialNo: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            위치
            <input
              required
              className="mt-1 w-full rounded border border-line px-3 py-2"
              value={form.location}
              onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            부서
            <input
              className="mt-1 w-full rounded border border-line px-3 py-2"
              value={form.departmentName}
              onChange={(e) => setForm((prev) => ({ ...prev, departmentName: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            담당자
            <input
              className="mt-1 w-full rounded border border-line px-3 py-2"
              value={form.ownerName}
              onChange={(e) => setForm((prev) => ({ ...prev, ownerName: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            취득일
            <input
              type="date"
              className="mt-1 w-full rounded border border-line px-3 py-2"
              value={form.acquiredAt}
              onChange={(e) => setForm((prev) => ({ ...prev, acquiredAt: e.target.value }))}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            저장
          </button>
        </form>
      ) : null}
    </div>
  )
}
