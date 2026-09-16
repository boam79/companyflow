import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { executeAssignAsset, executeReturnAsset, assetNumber, loadAssets, type AssetRecord } from '../lib/asset/book'
import { suggestNextAssign } from '../lib/asset/nextAssign'
import { writeDefaultMaster } from '../lib/master/book'
import { loadEmployees, type EmployeeRecord } from '../lib/people/employment'
import { getCompanySqlite } from '../lib/sqlite/instance'
import { getSupabase, type CompanyRow } from '../lib/supabase'

type NamedRow = { id: string; name: string }

const sqlite = getCompanySqlite()

export function AssetsPage() {
  const { configured, loading, user } = useAuth()
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [companyId, setCompanyId] = useState('')
  const [items, setItems] = useState<NamedRow[]>([])
  const [warehouses, setWarehouses] = useState<NamedRow[]>([])
  const [employees, setEmployees] = useState<EmployeeRecord[]>([])
  const [assets, setAssets] = useState<AssetRecord[]>([])
  const [assignEmployeeId, setAssignEmployeeId] = useState('')
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
      const [itemRows, warehouseRows, employeeRows, assetRows] = await Promise.all([
        sqlite.query<NamedRow>('select id, name from items order by name'),
        sqlite.query<NamedRow>('select id, name from warehouses order by name'),
        loadEmployees(sqlite),
        loadAssets(sqlite),
      ])
      setItems(itemRows)
      setWarehouses(warehouseRows)
      setEmployees(employeeRows)
      setAssets(assetRows)
      setAssignEmployeeId((current) => {
        const active = employeeRows.filter((row) => !row.leftAt)
        if (current && active.some((row) => row.id === current)) return current
        return active[0]?.id || ''
      })
    } catch (error) {
      setReady(false)
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      opening.current = false
    }
  }

  async function assignAsset(assetId: string, employeeId = assignEmployeeId) {
    if (!ready || !employeeId) {
      setMessage('기준정보에서 직원을 먼저 등록하세요.')
      return
    }
    setMessage('')
    setNotice('')
    try {
      const result = await executeAssignAsset(sqlite, {
        operationId: crypto.randomUUID(),
        assetId,
        employeeId,
      })
      setAssignEmployeeId(employeeId)
      setNotice(
        result.status === 'duplicate'
          ? '같은 배정은 한 번만 반영됩니다.'
          : `배정했습니다. ${employees.find((row) => row.id === employeeId)?.name ?? employeeId}`,
      )
      setAssets(await loadAssets(sqlite))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function returnAsset(assetId: string) {
    if (!ready) return
    setMessage('')
    setNotice('')
    try {
      const result = await executeReturnAsset(sqlite, {
        operationId: crypto.randomUUID(),
        assetId,
      })
      setNotice(result.status === 'duplicate' ? '같은 회수는 한 번만 반영됩니다.' : '보관으로 회수했습니다.')
      setAssets(await loadAssets(sqlite))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

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
          재고에서 자산화한 개별 자산입니다. 보관 중인 자산만 직원에게 배정할 수 있습니다.
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
          구매·재고에서 자산화
        </Link>
        <Link className="rounded border border-line px-3 py-2 text-sm" to="/people">
          직원·입퇴사
        </Link>
        <Link className="rounded border border-line px-3 py-2 text-sm" to="/reports">
          통계
        </Link>
      </div>
      {notice ? <p className="text-sm text-ok">{notice}</p> : null}
      {message ? <p className="text-sm text-danger">{message}</p> : null}
      {(() => {
        const next = suggestNextAssign(assets, employees)
        if (!next || !ready) return null
        return (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent bg-accent-soft px-5 py-4">
            <p className="text-sm text-accent">
              보관 자산 {assets.filter((asset) => asset.status === 'in_storage').length}건을 {next.employeeName}
              에게 배정하면 입퇴사와 연결됩니다.
            </p>
            <button
              type="button"
              disabled={!ready}
              className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={() => void assignAsset(next.assetId, next.employeeId)}
            >
              {next.employeeName}에게 배정 1
            </button>
          </section>
        )
      })()}
      <section className="rounded-lg border border-line bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">
            보관 {assets.filter((asset) => asset.status === 'in_storage').length} · 배정{' '}
            {assets.filter((asset) => asset.status === 'assigned').length}
          </h2>
          <label className="text-sm">
            배정 직원
            <select
              className="ml-2 rounded border border-line px-3 py-2"
              value={assignEmployeeId}
              onChange={(e) => setAssignEmployeeId(e.target.value)}
            >
              <option value="">선택</option>
              {employees
                .filter((employee) => !employee.leftAt)
                .map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {assets.length ? (
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="py-2 pr-3 font-medium">자산</th>
                <th className="py-2 pr-3 font-medium">품목</th>
                <th className="py-2 pr-3 font-medium">위치</th>
                <th className="py-2 pr-3 font-medium">상태</th>
                <th className="py-2 font-medium">직원</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr key={asset.id} className="border-b border-line/70">
                  <td className="py-2 pr-3">{assetNumber(asset.id)}</td>
                  <td className="py-2 pr-3">
                    {items.find((item) => item.id === asset.itemId)?.name ?? asset.itemId}
                  </td>
                  <td className="py-2 pr-3">
                    {warehouses.find((warehouse) => warehouse.id === asset.warehouseId)?.name ??
                      asset.warehouseId}
                  </td>
                  <td className="py-2 pr-3">{asset.status === 'in_storage' ? '보관' : '배정'}</td>
                  <td className="py-2">
                    {asset.status === 'assigned' ? (
                      <span className="flex flex-wrap items-center gap-2">
                        {employees.find((employee) => employee.id === asset.employeeId)?.name ??
                          asset.employeeId}
                        <button
                          type="button"
                          disabled={!ready}
                          className="rounded border border-line px-3 py-1 text-xs font-semibold disabled:opacity-50"
                          onClick={() => void returnAsset(asset.id)}
                        >
                          회수
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={!ready || !assignEmployeeId}
                        className="rounded bg-accent px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                        onClick={() => void assignAsset(asset.id)}
                      >
                        배정
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-sm text-muted">
            {ready
              ? '아직 자산이 없습니다. 구매·재고에서 자산화 1을 확정하세요.'
              : '회사 DB를 여는 중입니다.'}
          </p>
        )}
      </section>
    </div>
  )
}
