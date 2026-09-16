import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { loadAssets, type AssetRecord } from '../lib/asset/book'
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
  const [assets, setAssets] = useState<AssetRecord[]>([])
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
      const [itemRows, warehouseRows, assetRows] = await Promise.all([
        sqlite.query<NamedRow>('select id, name from items order by name'),
        sqlite.query<NamedRow>('select id, name from warehouses order by name'),
        loadAssets(sqlite),
      ])
      setItems(itemRows)
      setWarehouses(warehouseRows)
      setAssets(assetRows)
    } catch (error) {
      setReady(false)
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      opening.current = false
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
          재고에서 자산화한 개별 자산입니다. 재고와 자산을 동시에 보유하지 않습니다.
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
      </div>
      {message ? <p className="text-sm text-danger">{message}</p> : null}
      <section className="rounded-lg border border-line bg-card p-5">
        <h2 className="text-lg font-semibold">보관 중 {assets.length}</h2>
        {assets.length ? (
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="py-2 pr-3 font-medium">자산</th>
                <th className="py-2 pr-3 font-medium">품목</th>
                <th className="py-2 pr-3 font-medium">위치</th>
                <th className="py-2 font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr key={asset.id} className="border-b border-line/70">
                  <td className="py-2 pr-3">{asset.id}</td>
                  <td className="py-2 pr-3">
                    {items.find((item) => item.id === asset.itemId)?.name ?? asset.itemId}
                  </td>
                  <td className="py-2 pr-3">
                    {warehouses.find((warehouse) => warehouse.id === asset.warehouseId)?.name ??
                      asset.warehouseId}
                  </td>
                  <td className="py-2">{asset.status === 'in_storage' ? '보관' : '배정'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-sm text-muted">
            {ready
              ? '아직 자산이 없습니다. 구매·재고에서 자산화를 확정하세요.'
              : '회사 DB를 여는 중입니다.'}
          </p>
        )}
      </section>
    </div>
  )
}
