import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { loadAssets } from '../lib/asset/book'
import { isSupplyItem, loadItems, writeDefaultMaster, type ItemRecord } from '../lib/master/book'
import { migrateProcessAssetsToChecks } from '../lib/people/onboarding'
import { retireSupplyAssets } from '../lib/asset/retireSupplies'
import { csvFromSupplyReport, reportDetails, summarizeStock, type DateRange, type ReportDetail } from '../lib/reports/summary'
import { getCompanySqlite } from '../lib/sqlite/instance'
import { loadStockState } from '../lib/stock/persist'
import { getSupabase, type CompanyRow } from '../lib/supabase'

const sqlite = getCompanySqlite()

function todayStamp() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
}

export function ReportsPage() {
  const { configured, loading, user } = useAuth()
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [companyId, setCompanyId] = useState('')
  const [items, setItems] = useState<ItemRecord[]>([])
  const [itemId, setItemId] = useState('item-paper')
  const [range, setRange] = useState<DateRange>({ from: '2026-09-01', to: todayStamp() })
  const [summary, setSummary] = useState<ReturnType<typeof summarizeStock> | null>(null)
  const [details, setDetails] = useState<ReportDetail[]>([])
  const [notice, setNotice] = useState('')
  const [message, setMessage] = useState('')
  const [ready, setReady] = useState(false)
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
      const itemRows = await loadItems(sqlite)
      const supply = itemRows.filter((row) => isSupplyItem(row))
      setItems(supply)
      const nextItem = supply.some((row) => row.id === itemId)
        ? itemId
        : supply.find((row) => row.id === 'item-paper')?.id || supply[0]?.id
      if (nextItem) setItemId(nextItem)
      await refreshSummary(nextItem || itemId)
    } catch (error) {
      setReady(false)
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      opening.current = false
    }
  }

  async function refreshSummary(nextItemId = itemId, nextRange = range) {
    const [state, assets, loadedItems] = await Promise.all([
      loadStockState(sqlite),
      loadAssets(sqlite),
      loadItems(sqlite),
    ])
    const itemRows = loadedItems.filter((row) => isSupplyItem(row))
    setItems(itemRows)
    setSummary(summarizeStock(state, assets, nextItemId, nextRange, itemRows.find((row) => row.id === nextItemId)))
    setDetails(reportDetails(state.ledger, nextItemId, nextRange))
  }

  function downloadCsv() {
    if (!summary) return
    const itemName = items.find((item) => item.id === itemId)?.name ?? itemId
    const blob = new Blob(['\uFEFF' + csvFromSupplyReport(itemName, summary, range, details)], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `비품통계-${itemName}-${range.from}-${range.to}.csv`
    link.click()
    URL.revokeObjectURL(url)
    setNotice('같은 원본의 요약·상세로 Excel용 CSV를 받았습니다.')
  }

  if (loading) return <p className="text-sm text-muted">세션을 확인하는 중입니다.</p>
  if (!configured) return <p className="text-sm text-muted">중앙 운영이 연결되지 않았습니다.</p>
  if (!user) {
    return (
      <p className="text-sm">
        통계는 로그인 후 지정 PC에서 봅니다.{' '}
        <Link className="text-accent underline" to="/login">
          로그인
        </Link>
      </p>
    )
  }

  const itemName = items.find((item) => item.id === itemId)?.name ?? itemId

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">통계</h1>
        <p className="mt-2 text-sm text-muted">
          복사용지처럼 비품만 집계합니다. 가구·컴퓨터는 자산 메뉴에서 보고, 창고 이동은 회사 합계에서 빼 둡니다.
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
          수불부
        </Link>
        <Link className="rounded border border-line px-3 py-2 text-sm" to="/assets">
          자산
        </Link>
      </div>
      {notice ? <p className="text-sm text-ok">{notice}</p> : null}
      {message ? <p className="text-sm text-danger">{message}</p> : null}
      <section className="rounded-lg border border-line bg-card p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            품목
            <select
              className="ml-2 rounded border border-line px-3 py-2"
              value={itemId}
              onChange={(e) => {
                setItemId(e.target.value)
                void refreshSummary(e.target.value)
              }}
            >
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            시작일
            <input
              type="date"
              className="ml-2 rounded border border-line px-3 py-2"
              value={range.from}
              onChange={(e) => {
                const next = { ...range, from: e.target.value }
                setRange(next)
                void refreshSummary(itemId, next)
              }}
            />
          </label>
          <label className="text-sm">
            종료일
            <input
              type="date"
              className="ml-2 rounded border border-line px-3 py-2"
              value={range.to}
              onChange={(e) => {
                const next = { ...range, to: e.target.value }
                setRange(next)
                void refreshSummary(itemId, next)
              }}
            />
          </label>
          <button
            type="button"
            disabled={!ready || !summary}
            className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={downloadCsv}
          >
            Excel CSV
          </button>
        </div>
        {summary ? (
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="py-2 pr-3 font-medium">비품</th>
                <th className="py-2 pr-3 font-medium">입고</th>
                <th className="py-2 pr-3 font-medium">출고</th>
                <th className="py-2 font-medium">현재고</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-2 pr-3">{itemName}</td>
                <td className="py-2 pr-3">{summary.receipt}</td>
                <td className="py-2 pr-3">{summary.issue}</td>
                <td className="py-2">{summary.onHand}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="mt-3 text-sm text-muted">{ready ? '집계할 품목을 고르세요.' : '회사 DB를 여는 중입니다.'}</p>
        )}
        {details.length ? (
          <table className="mt-6 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="py-2 pr-3 font-medium">일자</th>
                <th className="py-2 pr-3 font-medium">구분</th>
                <th className="py-2 pr-3 font-medium">방향</th>
                <th className="py-2 font-medium">수량</th>
              </tr>
            </thead>
            <tbody>
              {details.map((row, index) => (
                <tr key={`${row.day}-${row.label}-${index}`} className="border-b border-line/70">
                  <td className="py-2 pr-3">{row.day}</td>
                  <td className="py-2 pr-3">{row.label}</td>
                  <td className="py-2 pr-3">{row.direction === 'in' ? '입고' : '출고'}</td>
                  <td className="py-2">{row.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
    </div>
  )
}
