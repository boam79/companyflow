import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { assetNumber, loadAssets, type AssetRecord } from '../lib/asset/book'
import { assetQrDataUrl, assetQrFileName } from '../lib/asset/qr'
import { loadItems, writeDefaultMaster, type ItemRecord } from '../lib/master/book'
import { isProcessItemId, migrateProcessAssetsToChecks } from '../lib/people/onboarding'
import { getCompanySqlite } from '../lib/sqlite/instance'
import { getSupabase, type CompanyRow } from '../lib/supabase'

type NamedRow = { id: string; name: string }

const sqlite = getCompanySqlite()

export function AssetsPage() {
  const { configured, loading, user } = useAuth()
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [companyId, setCompanyId] = useState('')
  const [items, setItems] = useState<ItemRecord[]>([])
  const [warehouses, setWarehouses] = useState<NamedRow[]>([])
  const [assets, setAssets] = useState<AssetRecord[]>([])
  const [qrUrls, setQrUrls] = useState<Record<string, string>>({})
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
      const [itemRows, warehouseRows, assetRows] = await Promise.all([
        loadItems(sqlite),
        sqlite.query<NamedRow>('select id, name from warehouses order by name'),
        loadAssets(sqlite),
      ])
      setItems(itemRows)
      setWarehouses(warehouseRows)
      setAssets(assetRows)
      const companyOnly = assetRows.filter((asset) => !isProcessItemId(asset.itemId))
      const urls = await Promise.all(
        companyOnly.map(async (asset) => {
          const number = assetNumber(asset.id)
          return [asset.id, await assetQrDataUrl(number)] as const
        }),
      )
      setQrUrls(Object.fromEntries(urls))
    } catch (error) {
      setReady(false)
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      opening.current = false
    }
  }

  const companyAssets = assets.filter((asset) => !isProcessItemId(asset.itemId))

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
          재고에서 자산화한 회사 재산만 봅니다. 명찰·유니폼·노트북은 입퇴사 프로세스입니다. QR을 받아 자산에 붙이면 번호로 찾습니다.
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
        <Link className="rounded border border-line px-3 py-2 text-sm" to="/reports">
          통계
        </Link>
      </div>
      {notice ? <p className="text-sm text-ok">{notice}</p> : null}
      {message ? <p className="text-sm text-danger">{message}</p> : null}
      <section className="rounded-lg border border-line bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">회사 자산 {companyAssets.length}</h2>
        </div>
        {companyAssets.length ? (
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="py-2 pr-3 font-medium">자산</th>
                <th className="py-2 pr-3 font-medium">QR</th>
                <th className="py-2 pr-3 font-medium">품목</th>
                <th className="py-2 pr-3 font-medium">위치</th>
                <th className="py-2 pr-3 font-medium">상태</th>
                <th className="py-2 font-medium">비고</th>
              </tr>
            </thead>
            <tbody>
              {companyAssets.map((asset) => {
                const item = items.find((row) => row.id === asset.itemId)
                const number = assetNumber(asset.id)
                const qr = qrUrls[asset.id]
                return (
                  <tr key={asset.id} className="border-b border-line/70">
                    <td className="py-2 pr-3">{number}</td>
                    <td className="py-2 pr-3">
                      {qr ? (
                        <div className="flex items-center gap-2">
                          <img src={qr} alt={`${number} QR`} className="h-16 w-16 bg-white p-1" />
                          <button
                            type="button"
                            className="rounded border border-line px-2 py-1 text-xs font-semibold"
                            onClick={() => {
                              const link = document.createElement('a')
                              link.href = qr
                              link.download = assetQrFileName(number)
                              link.click()
                              setNotice(`${assetQrFileName(number)}을 이 PC에서 받았습니다. 인쇄해 자산에 붙이세요.`)
                            }}
                          >
                            QR 받기
                          </button>
                        </div>
                      ) : (
                        <span className="text-muted">그리는 중</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">{item?.name ?? asset.itemId}</td>
                    <td className="py-2 pr-3">
                      {warehouses.find((warehouse) => warehouse.id === asset.warehouseId)?.name ??
                        asset.warehouseId}
                    </td>
                    <td className="py-2 pr-3">회사 보관</td>
                    <td className="py-2 text-muted">입퇴사 지급품 아님</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-sm text-muted">
            {ready
              ? '회사 자산이 없습니다. 재고에서 자산관리 품목을 자산화하세요. 명찰·유니폼·노트북은 입퇴사에서 다룹니다.'
              : '회사 DB를 여는 중입니다.'}
          </p>
        )}
      </section>
    </div>
  )
}
