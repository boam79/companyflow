import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { assetNumber, loadAssets, type AssetRecord } from '../lib/asset/book'
import { assertQrAssetPayload, executeQrRegistration, type QrAssetPayload } from '../lib/asset/register'
import { fetchPendingQrInbox, importAssetQr, insertBlankQrLabels, type AssetQrInboxRow } from '../lib/asset/relay'
import { assertBlankQrCount, blankQrDataUrl, blankQrFileName, blankQrScanUrl } from '../lib/asset/qr'
import { isCompanyAssetItem, loadItems, writeDefaultMaster, type ItemRecord } from '../lib/master/book'
import { migrateProcessAssetsToChecks } from '../lib/people/onboarding'
import { retireSupplyAssets } from '../lib/asset/retireSupplies'
import { getCompanySqlite } from '../lib/sqlite/instance'
import { getSupabase, type CompanyRow } from '../lib/supabase'

type NamedRow = { id: string; name: string }
type PrintedQr = { id: string; url: string; dataUrl: string }

const sqlite = getCompanySqlite()

function payloadFromUnknown(value: unknown): QrAssetPayload {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return assertQrAssetPayload({
    itemName: String(row.itemName ?? ''),
    model: String(row.model ?? ''),
    serialNo: String(row.serialNo ?? ''),
    location: String(row.location ?? ''),
    departmentName: String(row.departmentName ?? ''),
    ownerName: String(row.ownerName ?? ''),
    acquiredAt: String(row.acquiredAt ?? ''),
  })
}

export function AssetsPage() {
  const { configured, loading, user } = useAuth()
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [companyId, setCompanyId] = useState('')
  const [items, setItems] = useState<ItemRecord[]>([])
  const [warehouses, setWarehouses] = useState<NamedRow[]>([])
  const [assets, setAssets] = useState<AssetRecord[]>([])
  const [inbox, setInbox] = useState<AssetQrInboxRow[]>([])
  const [printed, setPrinted] = useState<PrintedQr[]>([])
  const [blankCount, setBlankCount] = useState(4)
  const [notice, setNotice] = useState('')
  const [message, setMessage] = useState('')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const opening = useRef(false)

  useEffect(() => {
    if (!user) return
    const client = getSupabase()
    if (!client) return
    void client
      .from('companies')
      .select('id, display_name, company_code, registration_status')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!data?.length) return
        setCompanies(data as CompanyRow[])
        setCompanyId((prev) => prev || data[0].id)
      })
  }, [user])

  useEffect(() => {
    if (!companyId || ready || opening.current) return
    void openCompany(companyId)
  }, [companyId, ready])

  async function refreshInbox(nextId: string) {
    const client = getSupabase()
    if (!client) return
    setInbox(await fetchPendingQrInbox(client, nextId))
  }

  async function openCompany(nextId: string, force = false) {
    opening.current = true
    setCompanyId(nextId)
    setMessage('')
    try {
      await sqlite.open(nextId, { force })
      setReady(sqlite.persistOk)
      if (!sqlite.persistOk) {
        setMessage('이 브라우저에서 영속 DB를 열 수 없습니다. 지정 Chrome에서 초기 설정을 먼저 하세요.')
        return
      }
      await writeDefaultMaster(sqlite)
      await migrateProcessAssetsToChecks(sqlite)
      await retireSupplyAssets(sqlite)
      const [itemRows, warehouseRows, assetRows] = await Promise.all([
        loadItems(sqlite),
        sqlite.query<NamedRow>('select id, name from warehouses order by name'),
        loadAssets(sqlite),
      ])
      setItems(itemRows)
      setWarehouses(warehouseRows)
      setAssets(assetRows)
      await refreshInbox(nextId)
    } catch (error) {
      setReady(false)
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      opening.current = false
    }
  }

  async function makeBlankQrs() {
    const client = getSupabase()
    if (!client || !companyId || !ready) {
      setMessage('지정 PC에서 회사를 연 뒤에 빈 QR을 만듭니다.')
      return
    }
    setBusy(true)
    setMessage('')
    setNotice('')
    try {
      const count = assertBlankQrCount(blankCount)
      const ids = Array.from({ length: count }, () => crypto.randomUUID())
      const origin = window.location.origin
      await insertBlankQrLabels(client, companyId, ids)
      const createdAt = new Date().toISOString()
      await sqlite.batch(
        ids.map((id) => ({
          sql: 'insert or ignore into qr_labels(id, status, created_at) values(?, ?, ?)',
          params: [id, 'blank', createdAt],
        })),
      )
      const urls = await Promise.all(
        ids.map(async (id) => ({
          id,
          url: blankQrScanUrl(origin, id),
          dataUrl: await blankQrDataUrl(origin, id),
        })),
      )
      setPrinted(urls)
      setNotice(`빈 QR ${count}장을 만들었습니다. 인쇄해 가구·컴퓨터에 붙인 뒤 스마트폰으로 읽으세요.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  async function importOne(row: AssetQrInboxRow) {
    const client = getSupabase()
    if (!client || !ready) return
    setBusy(true)
    setMessage('')
    try {
      const payload = payloadFromUnknown(row.payload)
      const result = await executeQrRegistration(sqlite, { labelId: row.label_id, payload })
      await importAssetQr(client, row.label_id)
      setAssets(await loadAssets(sqlite))
      await refreshInbox(companyId)
      setNotice(
        result.status === 'duplicate'
          ? '이미 원본에 반영된 QR입니다.'
          : `${result.assetNumber ?? '자산'}을 원본에 반영했습니다.`,
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  function printSheet() {
    if (!printed.length) return
    const page = window.open('', '_blank')
    if (!page) {
      setMessage('인쇄 창을 열 수 없습니다.')
      return
    }
    page.document.write(`<!doctype html><title>빈 QR</title><body style="font-family:sans-serif">`)
    page.document.write(
      printed
        .map(
          (row, index) =>
            `<div style="display:inline-block;text-align:center;margin:12px"><img src="${row.dataUrl}" width="180" height="180"><div>빈QR-${String(index + 1).padStart(2, '0')}</div></div>`,
        )
        .join(''),
    )
    page.document.write(`</body>`)
    page.document.close()
    page.focus()
    page.print()
  }

  const companyAssets = assets.filter((asset) =>
    isCompanyAssetItem(items.find((item) => item.id === asset.itemId)),
  )

  if (loading) return <p className="text-sm text-muted">세션을 확인하는 중입니다.</p>
  if (!configured) return <p className="text-sm text-muted">중앙 운영이 연결되지 않았습니다.</p>
  if (!user) {
    return (
      <p className="text-sm">
        자산은 로그인 후 지정 PC에서 다룹니다.{' '}
        <Link className="text-accent underline" to="/login">
          로그인
        </Link>
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">자산</h1>
        <p className="mt-2 text-sm text-muted">
          빈 QR을 만들어 책상·의자·컴퓨터 같은 회사 자산에 붙입니다. 직원이 스마트폰으로 읽고 위치·품목 정보를 넣으면, 이 PC가 원본에 반영합니다.
          회사 자산은 자리에 두는 물건이며 직원에게 배정하지 않습니다. 복사용지 같은 비품은 재고이며 QR을 붙이지 않습니다.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <select
          className="rounded border border-line px-3 py-2 text-sm"
          value={companyId}
          onChange={(e) => {
            setReady(false)
            void openCompany(e.target.value, true)
          }}
        >
          <option value="">회사 선택</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.display_name} ({company.company_code})
            </option>
          ))}
        </select>
        <Link className="rounded border border-line px-3 py-2 text-sm" to="/stock">
          비품 재고
        </Link>
      </div>
      {notice ? <p className="text-sm text-ok">{notice}</p> : null}
      {message ? <p className="text-sm text-danger">{message}</p> : null}

      <section className="rounded-lg border border-line bg-card p-5">
        <h2 className="text-lg font-semibold">빈 QR 만들기</h2>
        <p className="mt-1 text-sm text-muted">자산번호는 넣지 않습니다. 스티커를 붙인 뒤 스마트폰으로 정보를 입력합니다.</p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            장수
            <input
              type="number"
              min={1}
              max={40}
              className="ml-2 w-20 rounded border border-line px-2 py-2"
              value={blankCount}
              onChange={(e) => setBlankCount(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            disabled={busy || !ready}
            className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={() => void makeBlankQrs()}
          >
            빈 QR 만들기
          </button>
          {printed.length ? (
            <button type="button" className="rounded border border-line px-3 py-2 text-sm" onClick={printSheet}>
              인쇄
            </button>
          ) : null}
        </div>
        {printed.length ? (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {printed.map((row, index) => (
              <div key={row.id} className="rounded border border-line p-3 text-center">
                <img src={row.dataUrl} alt={`빈 QR ${index + 1}`} className="mx-auto h-28 w-28 bg-white p-1" />
                <p className="mt-1 text-xs text-muted">빈QR-{String(index + 1).padStart(2, '0')}</p>
                <button
                  type="button"
                  className="mt-2 rounded border border-line px-2 py-1 text-xs font-semibold"
                  onClick={() => {
                    const link = document.createElement('a')
                    link.href = row.dataUrl
                    link.download = blankQrFileName(index + 1)
                    link.click()
                  }}
                >
                  PNG 받기
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-line bg-card p-5">
        <h2 className="text-lg font-semibold">스마트폰에서 저장 {inbox.length}</h2>
        {inbox.length ? (
          <ul className="mt-3 space-y-2 text-sm">
            {inbox.map((row) => {
              const payload = row.payload as Partial<QrAssetPayload>
              return (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 py-2">
                  <span>
                    {String(payload.itemName ?? '자산')} · {String(payload.location ?? '위치 없음')} ·{' '}
                    {String(payload.ownerName || payload.departmentName || '담당 없음')}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded bg-accent px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    onClick={() => void importOne(row)}
                  >
                    원본에 반영
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">
            {ready ? '스마트폰에서 저장한 빈 QR이 없습니다.' : '회사 DB를 여는 중입니다.'}
          </p>
        )}
      </section>

      <section className="rounded-lg border border-line bg-card p-5">
        <h2 className="text-lg font-semibold">회사 자산 {companyAssets.length}</h2>
        {companyAssets.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="py-2 pr-4 font-medium">자산번호</th>
                  <th className="py-2 pr-4 font-medium">품목</th>
                  <th className="py-2 pr-4 font-medium">모델·일련번호</th>
                  <th className="py-2 pr-4 font-medium">위치</th>
                  <th className="py-2 pr-4 font-medium">부서</th>
                  <th className="py-2 pr-4 font-medium">담당</th>
                  <th className="py-2 font-medium">취득</th>
                </tr>
              </thead>
              <tbody>
                {companyAssets.map((asset) => {
                  const item = items.find((row) => row.id === asset.itemId)
                  const location =
                    asset.locationText ||
                    warehouses.find((warehouse) => warehouse.id === asset.warehouseId)?.name ||
                    asset.warehouseId
                  return (
                    <tr key={asset.id} className="border-b border-line/70">
                      <td className="whitespace-nowrap py-2 pr-4 font-medium">{assetNumber(asset.id)}</td>
                      <td className="py-2 pr-4">{item?.name ?? asset.itemId}</td>
                      <td className="py-2 pr-4 text-muted">
                        {[asset.model, asset.serialNo].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="py-2 pr-4">{location || '—'}</td>
                      <td className="py-2 pr-4">{asset.departmentName || '—'}</td>
                      <td className="py-2 pr-4">{asset.ownerName || '—'}</td>
                      <td className="whitespace-nowrap py-2 text-muted">{asset.acquiredAt || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">
            {ready
              ? '회사 자산이 없습니다. 빈 QR을 가구·컴퓨터에 붙인 뒤 스마트폰에서 정보를 넣으세요.'
              : '회사 DB를 여는 중입니다.'}
          </p>
        )}
      </section>
    </div>
  )
}
