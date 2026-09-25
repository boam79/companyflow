import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { WorkGateNotice } from '../components/WorkGateNotice'
import { WorkCompanyControl } from '../components/WorkCompanyControl'
import { assetNumber, loadAssets, type AssetRecord } from '../lib/asset/book'
import { preventImeEnterSubmit } from '../lib/asset/hangulIme'
import {
  assetLifeLabel,
  executeAssetLife,
  loadAssetEvents,
  readAssetLifeForm,
  type AssetLifeEvent,
  type AssetLifeKind,
} from '../lib/asset/life'
import { assertQrAssetPayload, executeQrRegistration, loadQrLabels, type QrAssetPayload } from '../lib/asset/register'
import { fetchPendingQrInbox, importAssetQr, insertBlankQrLabels, type AssetQrInboxRow } from '../lib/asset/relay'
import { assertBlankQrCount, assertPngDataUrl, blankQrDataUrl, blankQrFileName, blankQrScanUrl } from '../lib/asset/qr'
import { escapeHtml } from '../lib/htmlEscape'
import { isCompanyAssetItem, loadItems, writeDefaultMaster, type ItemRecord } from '../lib/master/book'
import { ACTIVE_MASTER_WHERE } from '../lib/master/commands'
import { migrateProcessAssetsToChecks } from '../lib/people/onboarding'
import { retireSupplyAssets } from '../lib/asset/retireSupplies'
import { canWriteOpenedCompany, mayOpenCompanyWork, workSessionKind } from '../lib/company/workGate'
import { useWorkAccess } from '../lib/guest/workAccess'
import { assertGuestOpensMemory } from '../lib/guest/seed'
import { getSupabase } from '../lib/supabase'
import { formatCompanyDate, loadDisplayTimezone } from '../lib/company/displayCurrency'
import { showModuleLink } from '../lib/company/modules'
import { readCompanyModule } from '../lib/company/moduleAccess'
import { ModuleClosed } from '../components/ModuleClosed'

type NamedRow = { id: string; name: string }
type PrintedQr = { id: string; url: string; dataUrl: string }

function emptyLifeForm(today: string) {
  return {
    kind: 'transfer' as AssetLifeKind,
    happenedAt: today,
  }
}

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
  const { guest, sqlite, loading, configured, user, companies, companyId, sessionReady, setCompanyId, href } =
    useWorkAccess()
  const [items, setItems] = useState<ItemRecord[]>([])
  const [warehouses, setWarehouses] = useState<NamedRow[]>([])
  const [assets, setAssets] = useState<AssetRecord[]>([])
  const [inbox, setInbox] = useState<AssetQrInboxRow[]>([])
  const [printed, setPrinted] = useState<PrintedQr[]>([])
  const [boundQr, setBoundQr] = useState<PrintedQr | null>(null)
  const [blankCount, setBlankCount] = useState(4)
  const [selectedId, setSelectedId] = useState('')
  const [events, setEvents] = useState<AssetLifeEvent[]>([])
  const [today, setToday] = useState(() => formatCompanyDate(new Date(), 'Asia/Seoul'))
  const [lifeForm, setLifeForm] = useState(() => emptyLifeForm(formatCompanyDate(new Date(), 'Asia/Seoul')))
  const [formTick, setFormTick] = useState(0)
  const [notice, setNotice] = useState('')
  const [message, setMessage] = useState('')
  const [ready, setReady] = useState(() => sqlite.isOpen(sqlite.companyId))
  const [moduleOff, setModuleOff] = useState(false)
  const [stockLink, setStockLink] = useState(true)
  const [busy, setBusy] = useState(false)
  const opening = useRef(false)

  useEffect(() => {
    if (!companyId || opening.current) return
    void openCompany(companyId)
  }, [companyId])

  useEffect(() => {
    const token = assets.find((row) => row.id === selectedId)?.qrToken
    if (!token) {
      setBoundQr(null)
      return
    }
    let cancelled = false
    const origin = window.location.origin
    void (async () => {
      try {
        const url = blankQrScanUrl(origin, token, guest)
        const dataUrl = await blankQrDataUrl(origin, token, guest)
        if (!cancelled) setBoundQr({ id: token, url, dataUrl })
      } catch {
        if (!cancelled) setBoundQr(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [assets, selectedId, guest])

  async function refreshInbox(nextId: string) {
    if (guest) return
    const client = getSupabase()
    if (!client) return
    setInbox(await fetchPendingQrInbox(client, nextId))
  }

  async function openCompany(nextId: string, force = false) {
    if (!mayOpenCompanyWork(guest, nextId, companies)) return
    opening.current = true
    setCompanyId(nextId)
    setMessage('')
    try {
      await sqlite.open(nextId, { force })
      assertGuestOpensMemory(guest, sqlite.vfsName)
      setReady(sqlite.persistOk)
      if (!sqlite.persistOk) {
        setMessage('이 브라우저에서 영속 DB를 열 수 없습니다. 지정 Chrome에서 초기 설정을 먼저 하세요.')
        return
      }
      if (!guest && !(await readCompanyModule(sqlite, nextId, 'assets'))) {
        setModuleOff(true)
        setReady(true)
        return
      }
      setModuleOff(false)
      setStockLink(showModuleLink(guest, guest ? true : await readCompanyModule(sqlite, nextId, 'stock')))
      const stamp = formatCompanyDate(new Date(), guest ? 'Asia/Seoul' : await loadDisplayTimezone(sqlite))
      setToday(stamp)
      setLifeForm(emptyLifeForm(stamp))
      if (!guest) {
        await writeDefaultMaster(sqlite, { companyCode: companies.find((row) => row.id === nextId)?.company_code })
        await migrateProcessAssetsToChecks(sqlite)
        await retireSupplyAssets(sqlite)
      }
      const [itemRows, warehouseRows, assetRows] = await Promise.all([
        loadItems(sqlite),
        sqlite.query<NamedRow>(`select id, name from warehouses where ${ACTIVE_MASTER_WHERE} order by name`),
        loadAssets(sqlite),
      ])
      setItems(itemRows)
      setWarehouses(warehouseRows)
      setAssets(assetRows)
      const nextSelected = assetRows.some((row) => row.id === selectedId && row.status !== 'disposed')
        ? selectedId
        : (assetRows.find(
            (row) =>
              row.status !== 'disposed' && isCompanyAssetItem(itemRows.find((item) => item.id === row.itemId)),
          )?.id ?? '')
      setSelectedId(nextSelected)
      if (nextSelected) {
        setLifeForm(emptyLifeForm(stamp))
        setFormTick((tick) => tick + 1)
        setEvents(await loadAssetEvents(sqlite, nextSelected))
      } else {
        setEvents([])
      }
      if (guest) {
        const origin = window.location.origin
        const labels = await loadQrLabels(sqlite)
        const blanks = labels.filter((row) => row.status === 'blank')
        setPrinted(
          await Promise.all(
            blanks.map(async (row) => ({
              id: row.id,
              url: blankQrScanUrl(origin, row.id, true),
              dataUrl: await blankQrDataUrl(origin, row.id, true),
            })),
          ),
        )
      } else {
        await refreshInbox(nextId)
      }
    } catch (error) {
      setReady(false)
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      opening.current = false
    }
  }

  async function makeBlankQrs() {
    if (!canWriteOpenedCompany(guest, companyId, sqlite.companyId) || !ready) {
      setMessage(guest ? '샘플을 연 뒤에 빈 QR을 만듭니다.' : '지정 PC에서 회사를 연 뒤에 빈 QR을 만듭니다.')
      return
    }
    if (!guest) {
      const client = getSupabase()
      if (!client) {
        setMessage('지정 PC에서 회사를 연 뒤에 빈 QR을 만듭니다.')
        return
      }
    }
    setBusy(true)
    setMessage('')
    setNotice('')
    try {
      const count = assertBlankQrCount(blankCount)
      const ids = Array.from({ length: count }, () => crypto.randomUUID())
      const origin = window.location.origin
      if (!guest) {
        const client = getSupabase()
        if (!client) throw new Error('지정 PC에서 회사를 연 뒤에 빈 QR을 만듭니다.')
        await insertBlankQrLabels(client, companyId, ids)
      }
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
          url: blankQrScanUrl(origin, id, guest),
          dataUrl: await blankQrDataUrl(origin, id, guest),
        })),
      )
      setPrinted((prev) => (guest ? [...prev, ...urls] : urls))
      setNotice(
        guest
          ? `샘플 빈 QR ${count}장을 만들었습니다. 입력 열기를 눌러 이 화면에서 확인하세요. 지정 PC 원본은 건드리지 않습니다.`
          : `빈 QR ${count}장을 만들었습니다. 인쇄해 가구·컴퓨터에 붙인 뒤 스마트폰으로 읽으세요.`,
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  async function importOne(row: AssetQrInboxRow) {
    const client = getSupabase()
    if (!client || !ready || !canWriteOpenedCompany(guest, companyId, sqlite.companyId)) return
    setBusy(true)
    setMessage('')
    try {
      const payload = payloadFromUnknown(row.payload)
      const result = await executeQrRegistration(sqlite, { labelId: row.label_id, payload })
      await importAssetQr(client, row.label_id)
      const assetRows = await loadAssets(sqlite)
      setAssets(assetRows)
      const bound = assetRows.find((asset) => asset.qrToken === row.label_id)
      if (bound) {
        setSelectedId(bound.id)
        setLifeForm(emptyLifeForm(today))
        setFormTick((tick) => tick + 1)
        setEvents(await loadAssetEvents(sqlite, bound.id))
      }
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

  async function recordLife(data: FormData) {
    if (!ready || !selectedId || !canWriteOpenedCompany(guest, companyId, sqlite.companyId)) return
    setBusy(true)
    setMessage('')
    setNotice('')
    try {
      const fields = readAssetLifeForm(data)
      const result = await executeAssetLife(sqlite, {
        operationId: crypto.randomUUID(),
        assetId: selectedId,
        ...fields,
      })
      const assetRows = await loadAssets(sqlite)
      setAssets(assetRows)
      setEvents(await loadAssetEvents(sqlite, selectedId))
      setLifeForm({ kind: fields.kind, happenedAt: today })
      setFormTick((tick) => tick + 1)
      setNotice(
        result.status === 'duplicate'
          ? '같은 이력은 한 번만 반영됩니다.'
          : `${assetLifeLabel(fields.kind)} 이력을 남겼습니다. 직원에게 배정하지 않았습니다.`,
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
        .map((row, index) => {
          const src = escapeHtml(assertPngDataUrl(row.dataUrl))
          return `<div style="display:inline-block;text-align:center;margin:12px"><img src="${src}" width="180" height="180"><div>빈QR-${String(index + 1).padStart(2, '0')}</div></div>`
        })
        .join(''),
    )
    page.document.write(`</body>`)
    page.document.close()
    page.focus()
    page.print()
  }

  const companyAssets = assets.filter(
    (asset) =>
      asset.status !== 'disposed' && isCompanyAssetItem(items.find((item) => item.id === asset.itemId)),
  )
  const disposedAssets = assets.filter(
    (asset) => asset.status === 'disposed' && isCompanyAssetItem(items.find((item) => item.id === asset.itemId)),
  )
  const selected = assets.find((row) => row.id === selectedId)

  if (loading) return <p className="text-sm text-muted">세션을 확인하는 중입니다.</p>
  if (!guest && !configured) return <p className="text-sm text-muted">중앙 운영이 연결되지 않았습니다.</p>
  const gated = workSessionKind({
    guest,
    signedIn: Boolean(user),
    ready: sessionReady,
    companyId,
  })
  if (gated !== 'ok') {
    return (
      <WorkGateNotice
        guest={guest}
        signedIn={Boolean(user)}
        ready={sessionReady}
        companyId={companyId}
        loginHint="자산은 로그인 후 지정 PC에서 다룹니다."
      />
    )
  }
  if (!guest && moduleOff) {
    return (
      <ModuleClosed
        title="자산"
        companies={companies}
        companyId={companyId}
        onOpen={(id) => {
          setReady(false)
          void openCompany(id, true)
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">자산</h1>
          <p className="mt-1 max-w-4xl text-sm text-muted">
            {guest
              ? '샘플에서 빈 QR을 만들고 입력 열기로 가구·컴퓨터 정보를 넣습니다. 지정 PC 원본과 중앙 QR은 쓰지 않습니다. 회사 자산은 자리에 두는 물건이며 직원에게 배정하지 않습니다.'
              : '빈 QR을 만들어 책상·의자·컴퓨터 같은 회사 자산에 붙입니다. 직원이 스마트폰으로 읽고 위치·품목 정보를 넣으면, 이 PC가 원본에 반영합니다. 회사 자산은 자리에 두는 물건이며 직원에게 배정하지 않습니다. 자리 이동은 이관, 고치면 수리, 못 쓰면 폐기로 이력을 남깁니다. 복사용지 같은 비품은 재고이며 QR을 붙이지 않습니다.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {guest ? (
            <p className="rounded border border-line px-3 py-2 text-sm text-muted">샘플 회사</p>
          ) : (
            <WorkCompanyControl
              guest={false}
              companies={companies}
              companyId={companyId}
              onChange={(id) => {
                setReady(false)
                void openCompany(id, true)
              }}
            />
          )}
          {stockLink ? (
            <Link className="rounded border border-line px-3 py-2 text-sm" to={href('/stock')}>
              비품 재고
            </Link>
          ) : null}
        </div>
      </div>
      {notice ? <p className="text-sm text-ok">{notice}</p> : null}
      {message ? <p className="text-sm text-danger">{message}</p> : null}

      <div className="grid gap-3 lg:grid-cols-2">
      <section className="rounded-lg border border-line bg-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">빈 QR 만들기</h2>
            <p className="mt-1 text-sm text-muted">
              {guest
                ? '자산번호는 넣지 않습니다. 입력 열기를 눌러 이 화면에서 정보를 넣습니다.'
                : '자산번호는 넣지 않습니다. 스티커를 붙인 뒤 스마트폰으로 정보를 입력합니다.'}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
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
        </div>
        {printed.length ? (
          <div className="mt-3 flex gap-3 overflow-x-auto">
            {printed.map((row, index) => (
              <div key={row.id} className="w-32 shrink-0 rounded border border-line p-2 text-center">
                <img src={row.dataUrl} alt={`빈 QR ${index + 1}`} className="mx-auto h-20 w-20 bg-white p-1" />
                <p className="mt-1 text-xs text-muted">빈QR-{String(index + 1).padStart(2, '0')}</p>
                <div className="mt-1 flex justify-center gap-1">
                  <Link
                    className="rounded border border-line px-1.5 py-0.5 text-xs font-semibold"
                    to={href(`/q/${row.id}`)}
                  >
                    입력 열기
                  </Link>
                  <button
                    type="button"
                    className="rounded border border-line px-1.5 py-0.5 text-xs font-semibold"
                    onClick={() => {
                      const link = document.createElement('a')
                      link.href = row.dataUrl
                      link.download = blankQrFileName(index + 1)
                      link.click()
                    }}
                  >
                    PNG
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-line bg-card p-4">
        <h2 className="text-base font-semibold">
          {guest ? '샘플 입력' : `스마트폰에서 저장 ${inbox.length}`}
        </h2>
        {guest ? (
          <p className="mt-2 text-sm text-muted">
            입력 열기에서 저장하면 바로 샘플 자산에 들어갑니다. 지정 PC 원본과 중앙 QR은 쓰지 않습니다.
          </p>
        ) : inbox.length ? (
          <ul className="mt-2 max-h-36 space-y-1 overflow-auto text-sm">
            {inbox.map((row) => {
              const payload = row.payload as Partial<QrAssetPayload>
              return (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 py-1.5">
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
      </div>

      <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.9fr)] lg:items-start">
      <div className="flex min-h-0 flex-col gap-3">
      <section className="rounded-lg border border-line bg-card p-4">
        <h2 className="text-base font-semibold">회사 자산 {companyAssets.length}</h2>
        {companyAssets.length ? (
          <div className="mt-2 max-h-[calc(100svh-18rem)] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="sticky top-0 border-b border-line bg-card text-muted">
                  <th className="py-1.5 pr-3 font-medium">자산번호</th>
                  <th className="py-1.5 pr-3 font-medium">품목</th>
                  <th className="py-1.5 pr-3 font-medium">모델·일련번호</th>
                  <th className="py-1.5 pr-3 font-medium">위치</th>
                  <th className="py-1.5 pr-3 font-medium">부서</th>
                  <th className="py-1.5 pr-3 font-medium">담당</th>
                  <th className="py-1.5 font-medium">취득</th>
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
                    <tr
                      key={asset.id}
                      className={`cursor-pointer border-b border-line/70 ${
                        selectedId === asset.id ? 'bg-accent-soft' : 'hover:bg-paper'
                      }`}
                      onClick={() => {
                        setSelectedId(asset.id)
                        setLifeForm(emptyLifeForm(today))
                        setFormTick((tick) => tick + 1)
                        setMessage('')
                        void loadAssetEvents(sqlite, asset.id).then(setEvents)
                      }}
                    >
                      <td className="whitespace-nowrap py-2 pr-4 font-medium">
                        {assetNumber(asset.id, asset.serialNo)}
                      </td>
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

      {disposedAssets.length ? (
        <section className="rounded-lg border border-line bg-card p-4">
          <h2 className="text-base font-semibold">폐기 {disposedAssets.length}</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {disposedAssets.map((asset) => (
              <li key={asset.id}>
                {assetNumber(asset.id, asset.serialNo)} · {items.find((row) => row.id === asset.itemId)?.name ?? asset.itemId}{' '}
                · {asset.locationText || '위치 없음'}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      </div>

      {selected && selected.status !== 'disposed' ? (
        <section className="max-h-[calc(100svh-12rem)] overflow-auto rounded-lg border border-line bg-card p-4">
          <h2 className="text-base font-semibold">
            {items.find((row) => row.id === selected.itemId)?.name ?? '자산'} · {assetNumber(selected.id, selected.serialNo)}
          </h2>
          <p className="mt-1 text-sm text-muted">
            직원에게 배정하지 않습니다. 자리를 옮기면 이관, 고치면 수리, 더 이상 안 쓰면 폐기를 남깁니다.
            {selected.sourceOrderId ? ` 구매 원본 발주 ${selected.sourceOrderId}.` : ''}
          </p>
          {boundQr ? (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded border border-line p-3">
              <img src={boundQr.dataUrl} alt="등록 QR" className="h-20 w-20 bg-white p-1" />
              <div className="space-y-2 text-sm">
                <p className="text-muted">
                  {guest
                    ? '이 QR을 샘플에서 읽으면 상세와 이력이 열립니다. 자산번호는 QR에 넣지 않습니다.'
                    : '이 QR을 지정 PC에서 읽으면 상세와 이력이 열립니다. 자산번호는 QR에 넣지 않습니다.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link className="rounded border border-line px-2 py-1 text-xs font-semibold" to={href(`/q/${boundQr.id}`)}>
                    QR로 상세 보기
                  </Link>
                  <button
                    type="button"
                    className="rounded border border-line px-2 py-1 text-xs font-semibold"
                    onClick={() => {
                      const link = document.createElement('a')
                      link.href = boundQr.dataUrl
                      link.download = `${assetNumber(selected.id, selected.serialNo)}.png`
                      link.click()
                    }}
                  >
                    PNG 받기
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">
              {guest
                ? '빈 QR로 등록된 자산만 QR 상세를 엽니다. 견본으로 넣은 책상은 표식이 없습니다.'
                : '빈 QR로 등록된 자산만 QR 상세를 엽니다. 샘플로 넣은 책상은 표식이 없습니다.'}
            </p>
          )}
          <form
            key={`${selected.id}:${formTick}`}
            className="mt-3 grid gap-3 sm:grid-cols-2"
            lang="ko"
            onKeyDown={preventImeEnterSubmit}
            onSubmit={(event) => {
              event.preventDefault()
              void recordLife(new FormData(event.currentTarget))
            }}
          >
            <label className="text-sm">
              구분
              <select
                name="kind"
                className="mt-1 w-full rounded border border-line px-3 py-2"
                value={lifeForm.kind}
                onChange={(e) => setLifeForm((prev) => ({ ...prev, kind: e.target.value as AssetLifeKind }))}
              >
                <option value="transfer">이관</option>
                <option value="repair">수리</option>
                <option value="dispose">폐기</option>
              </select>
            </label>
            <label className="text-sm">
              발생일
              <input
                type="date"
                name="happenedAt"
                required
                className="mt-1 w-full rounded border border-line px-3 py-2"
                value={lifeForm.happenedAt}
                onChange={(e) => setLifeForm((prev) => ({ ...prev, happenedAt: e.target.value }))}
              />
            </label>
            {lifeForm.kind === 'transfer' ? (
              <>
                <label className="text-sm">
                  위치
                  <input
                    name="locationText"
                    required
                    autoComplete="off"
                    className="mt-1 w-full rounded border border-line px-3 py-2"
                    defaultValue={selected.locationText ?? ''}
                  />
                </label>
                <label className="text-sm">
                  부서
                  <input
                    name="departmentName"
                    autoComplete="off"
                    className="mt-1 w-full rounded border border-line px-3 py-2"
                    defaultValue={selected.departmentName ?? ''}
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  담당
                  <input
                    name="ownerName"
                    autoComplete="off"
                    className="mt-1 w-full rounded border border-line px-3 py-2"
                    defaultValue={selected.ownerName ?? ''}
                  />
                </label>
              </>
            ) : null}
            <label className="text-sm sm:col-span-2">
              사유
              <textarea
                name="reason"
                rows={2}
                autoComplete="off"
                className="mt-1 w-full rounded border border-line px-3 py-2"
                defaultValue=""
              />
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={busy || !ready}
                className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {assetLifeLabel(lifeForm.kind)} 저장
              </button>
            </div>
          </form>
          <h3 className="mt-4 text-sm font-semibold">이력 {events.length}</h3>
          {events.length ? (
            <ul className="mt-2 space-y-1 text-sm">
              {events.map((event) => (
                <li key={event.id} className="border-b border-line/70 py-1.5">
                  <span className="font-medium">{assetLifeLabel(event.kind)}</span>
                  <span className="text-muted"> · {event.happenedAt}</span>
                  {event.locationText ? <span> · {event.locationText}</span> : null}
                  {event.reason ? <span className="text-muted"> · {event.reason}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">이력이 없습니다.</p>
          )}
        </section>
      ) : (
        <section className="rounded-lg border border-dashed border-line bg-card p-4 text-sm text-muted">
          왼쪽 목록에서 회사 자산을 고르면 이관·수리·폐기를 남깁니다.
        </section>
      )}
      </div>
    </div>
  )
}
