import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { retireSupplyAssets } from '../lib/asset/retireSupplies'
import { loadContracts } from '../lib/contracts/book'
import { contractRecent, peopleRecent, recentWork, stockRecent, waitingReceipts, watchContracts, type ContractWatch, type ReceiptWait, type RecentWork } from '../lib/home/work'
import { writeDefaultMaster, loadItems } from '../lib/master/book'
import { groupRoster, loadEmployees, rosterCaption } from '../lib/people/employment'
import { loadHireEvents } from '../lib/people/hireWorkflow'
import { loadOnboardingChecks, migrateProcessAssetsToChecks, onboardingView } from '../lib/people/onboarding'
import { getCompanySqlite } from '../lib/sqlite/instance'
import { buildAssetOrderList, buildSupplyOrderList } from '../lib/stock/inventoryView'
import { loadStockState } from '../lib/stock/persist'
import { getSupabase, type CompanyRow } from '../lib/supabase'

const sqlite = getCompanySqlite()

function todayStamp() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
}

type JoiningRow = { id: string; name: string; caption: string }

type StoreStatus = {
  persisted: boolean | null
  quota: string
}

export function HomePage() {
  const { configured, loading, user, operator } = useAuth()
  const [store, setStore] = useState<StoreStatus>({
    persisted: null,
    quota: '확인 전',
  })
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [companyId, setCompanyId] = useState('')
  const [receipts, setReceipts] = useState<ReceiptWait[]>([])
  const [contracts, setContracts] = useState<ContractWatch[]>([])
  const [joining, setJoining] = useState<JoiningRow[]>([])
  const [recent, setRecent] = useState<RecentWork[]>([])
  const [ready, setReady] = useState(false)
  const [openFailed, setOpenFailed] = useState(false)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const opening = useRef(false)

  useEffect(() => {
    let cancelled = false
    async function inspect() {
      if (!navigator.storage?.estimate || !navigator.storage?.persisted) {
        if (!cancelled) {
          setStore({ persisted: false, quota: '이 브라우저는 OPFS 확인을 지원하지 않습니다.' })
        }
        return
      }
      const persisted = await navigator.storage.persisted()
      const estimate = await navigator.storage.estimate()
      if (cancelled) return
      const used = estimate.usage ?? 0
      const quota = estimate.quota ?? 0
      setStore({
        persisted,
        quota: `사용 ${Math.round(used / 1024)}KB / 할당 ${Math.round(quota / 1024 / 1024)}MB`,
      })
    }
    void inspect()
    return () => {
      cancelled = true
    }
  }, [])

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
    if (!companyId || ready || opening.current || openFailed) return
    void openCompany(companyId)
  }, [companyId, ready, openFailed])

  async function openCompany(nextId: string, force = false) {
    opening.current = true
    setCompanyId(nextId)
    setMessage('')
    setNotice('')
    setOpenFailed(false)
    try {
      await sqlite.open(nextId, { force })
      setReady(sqlite.persistOk)
      if (!sqlite.persistOk) {
        setOpenFailed(true)
        setMessage('이 브라우저에서 영속 DB를 열 수 없습니다. 지정 Chrome에서 초기 설정을 먼저 하세요.')
        return
      }
      await writeDefaultMaster(sqlite)
      await migrateProcessAssetsToChecks(sqlite)
      await retireSupplyAssets(sqlite)
      await reload()
      setNotice(`로컬 원본이 열렸습니다. VFS ${sqlite.vfsName}`)
    } catch (error) {
      setReady(false)
      setOpenFailed(true)
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      opening.current = false
    }
  }

  async function reload() {
    const [items, stock, contractRows, employees, checks, events] = await Promise.all([
      loadItems(sqlite),
      loadStockState(sqlite),
      loadContracts(sqlite),
      loadEmployees(sqlite),
      loadOnboardingChecks(sqlite),
      loadHireEvents(sqlite),
    ])
    const orders = [...buildSupplyOrderList(items, stock), ...buildAssetOrderList(items, stock)]
    setReceipts(waitingReceipts(orders))
    setContracts(watchContracts(contractRows, todayStamp()))
    setJoining(
      (groupRoster(employees, checks).find((section) => section.phase === 'joining')?.employees ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        caption: rosterCaption(row, onboardingView(row.id, checks)),
      })),
    )
    setRecent(
      recentWork([
        ...stockRecent(stock.ledger, items),
        ...peopleRecent(events, employees),
        ...contractRecent(contractRows),
      ]),
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">지정 PC 로컬 원본 · 한글 업무 화면</p>
          <h1 className="mt-1 text-2xl font-semibold">홈</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            수령 잔량, 60일 안 계약, 입사 중, 최근 작업을 먼저 봅니다. 결재와 통계는 두지 않습니다.
          </p>
        </div>
        {user ? (
          <select
            className="rounded border border-line px-3 py-2 text-sm"
            value={companyId}
            onChange={(e) => {
              setReady(false)
              setOpenFailed(false)
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
        ) : null}
      </div>

      {notice ? <p className="text-sm text-ok">{notice}</p> : null}
      {message ? <p className="text-sm text-danger">{message}</p> : null}

      {user ? (
        <section className="grid gap-4 lg:grid-cols-3">
          <WorkPanel
            title="수령 대기"
            count={receipts.length}
            to="/stock"
            empty="확정 발주 잔량이 없습니다."
            columns={['품목', '잔량']}
            rows={receipts.map((row) => ({
              id: row.orderId,
              cells: [row.itemName, String(row.remainingQty)],
            }))}
          />
          <WorkPanel
            title="계약 기한"
            count={contracts.length}
            to="/contracts"
            empty="60일 안에 끝나는 계약이 없습니다."
            columns={['계약', '종료', '상태']}
            rows={contracts.map((row) => ({
              id: `${row.title}-${row.endAt ?? ''}`,
              cells: [row.title, row.endAt ?? '—', row.watch],
              tone: row.watch === '만료' ? 'danger' : undefined,
            }))}
          />
          <WorkPanel
            title="입사 중"
            count={joining.length}
            to="/people"
            empty="입사 중인 직원이 없습니다."
            columns={['이름', '진행']}
            rows={joining.map((row) => ({
              id: row.id,
              cells: [row.name, row.caption],
            }))}
          />
        </section>
      ) : (
        <p className="text-sm">
          업무 목록은 로그인 후 지정 PC에서 엽니다.{' '}
          <Link className="text-accent underline" to="/login">
            로그인
          </Link>
        </p>
      )}

      {user ? (
        <section className="rounded-lg border border-line bg-card p-4">
          <h2 className="text-sm font-semibold">
            최근 작업 <span className="font-medium text-muted">{recent.length}</span>
          </h2>
          {recent.length ? (
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="py-1.5 pr-3 font-medium">시각</th>
                  <th className="py-1.5 pr-3 font-medium">내용</th>
                  <th className="py-1.5 font-medium">화면</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <tr key={row.id} className="border-b border-line/70 last:border-b-0">
                    <td className="whitespace-nowrap py-1.5 pr-3 text-muted">{row.at.slice(0, 10)}</td>
                    <td className="py-1.5 pr-3">
                      <span className="font-medium">{row.label}</span>
                      <span className="text-muted"> · {row.detail}</span>
                    </td>
                    <td className="whitespace-nowrap py-1.5">
                      <Link className="text-accent underline" to={row.to}>
                        열기
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 text-sm text-muted">최근 수령·입퇴사·계약 초안이 없습니다.</p>
          )}
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <StatusCard
          title="중앙 운영"
          value={configured ? '환경 변수 연결됨' : '미연결'}
          detail={
            configured
              ? 'Supabase Auth·회사 등록을 사용할 수 있습니다.'
              : 'VITE_SUPABASE_URL / ANON_KEY가 없습니다. 로컬 미리보기만 가능합니다.'
          }
        />
        <StatusCard
          title="이 기기 저장"
          value={
            store.persisted === null
              ? '확인 중'
              : store.persisted
                ? '영속 저장 가능'
                : '영속 저장 미확인'
          }
          detail={store.quota}
        />
        <StatusCard
          title="로그인"
          value={loading ? '확인 중' : user ? (operator ? '운영 관리자' : user.email ?? '로그인됨') : '로그아웃'}
          detail="권한은 user_metadata가 아니라 app_metadata만 봅니다."
        />
      </section>

      <section className="rounded-lg border border-line bg-card p-5">
        <h2 className="text-sm font-semibold">바로 가기</h2>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <li>
            <Link className="text-accent underline" to="/setup">
              이 PC를 업무 원본으로
            </Link>
          </li>
          <li>
            <Link className="text-accent underline" to="/master">
              기준정보
            </Link>
          </li>
          <li>
            <Link className="text-accent underline" to="/stock">
              구매·재고
            </Link>
          </li>
          <li>
            <Link className="text-accent underline" to="/assets">
              자산
            </Link>
          </li>
          <li>
            <Link className="text-accent underline" to="/people">
              입퇴사
            </Link>
          </li>
          <li>
            <Link className="text-accent underline" to="/contracts">
              계약
            </Link>
          </li>
          {operator ? (
            <li>
              <Link className="text-accent underline" to="/ops/companies">
                회사 등록
              </Link>
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  )
}

function WorkPanel(props: {
  title: string
  count: number
  to: string
  empty: string
  columns: string[]
  rows: { id: string; cells: string[]; tone?: 'danger' }[]
}) {
  return (
    <article className="rounded-lg border border-line bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {props.title} <span className="font-medium text-muted">{props.count}</span>
        </h2>
        <Link className="text-sm text-accent underline" to={props.to}>
          열기
        </Link>
      </div>
      {props.rows.length ? (
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-muted">
              {props.columns.map((column) => (
                <th key={column} className="py-1.5 pr-3 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.rows.slice(0, 8).map((row) => (
              <tr key={row.id} className="border-b border-line/70 last:border-b-0">
                {row.cells.map((cell, index) => (
                  <td
                    key={`${row.id}-${index}`}
                    className={`whitespace-nowrap py-1.5 pr-3 ${index === 0 ? 'font-medium' : ''} ${
                      row.tone === 'danger' && index === row.cells.length - 1 ? 'text-danger' : index > 0 ? 'text-muted' : ''
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-3 text-sm text-muted">{props.empty}</p>
      )}
      {props.rows.length > 8 ? (
        <p className="mt-2 text-xs text-muted">외 {props.rows.length - 8}건은 열기에서 봅니다.</p>
      ) : null}
    </article>
  )
}

function StatusCard(props: { title: string; value: string; detail: string }) {
  return (
    <article className="rounded-lg border border-line bg-card p-5 text-left">
      <h2 className="text-sm text-muted">{props.title}</h2>
      <p className="mt-2 text-xl font-semibold">{props.value}</p>
      <p className="mt-2 text-sm text-muted">{props.detail}</p>
    </article>
  )
}
