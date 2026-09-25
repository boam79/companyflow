import { useEffect, useRef, useState, type FormEvent } from 'react'
import { WorkGateNotice } from '../components/WorkGateNotice'
import { WorkCompanyControl } from '../components/WorkCompanyControl'
import { writeDefaultMaster, loadPartnerOriginal, itemCodePlaceholder } from '../lib/master/book'
import { retireSupplyAssets } from '../lib/asset/retireSupplies'
import { preventImeEnterSubmit } from '../lib/asset/hangulIme'
import {
  assertMasterTable,
  assertUniqueItemCode,
  assertUniqueItemName,
  assertUniquePartnerName,
  assertItemSupplier,
  itemCatalogUpdateStatement,
  masterDeactivateStatement,
  masterInsertStatement,
  partnerAttachment,
  partnerUpdateStatement,
  PURCHASE_KINDS,
  purchaseKindLabel,
  purchaseKindInsertStatement,
  purchaseKindRenameStatement,
  purchaseKindDeactivateStatement,
  assertUniquePurchaseKindName,
  assertPurchaseKind,
  ACTIVE_MASTER_WHERE,
  type MasterFieldEntity,
  type MasterTable,
  type PurchaseKindRow,
} from '../lib/master/commands'
import { toArrayBuffer } from '../lib/contracts/book'
import { canWriteOpenedCompany, mayOpenCompanyWork, workSessionKind } from '../lib/company/workGate'
import { useWorkAccess } from '../lib/guest/workAccess'
import { assertGuestOpensMemory } from '../lib/guest/seed'
import { showsWorkDbReopen, workOpenedNotice } from '../lib/data/storageStatus'

type NamedRow = {
  id: string
  name: string
  department_id?: string | null
  title?: string | null
  left_at?: string | null
  stock_managed?: number | null
  asset_managed?: number | null
  min_stock?: number | null
  code?: string | null
  unit?: string | null
  purchase_kind?: string | null
  partner_id?: string | null
  phone?: string | null
  memo?: string | null
  file_name?: string | null
  has_file?: number | null
}
type FieldRow = { entity: string; key: string; label: string }
type TabId = MasterTable | 'fields'
type TableColumn = { key: string; label: string; muted?: boolean }
type TableRow = { id: string } & Record<string, string>

function itemKindLabel(row: NamedRow) {
  if (row.asset_managed === 1) return '회사 자산'
  if (row.stock_managed === 1) return '비품'
  return '품목'
}

function MasterTable({
  columns,
  rows,
  selectedId,
  onRowClick,
}: {
  columns: TableColumn[]
  rows: TableRow[]
  selectedId?: string
  onRowClick?: (id: string) => void
}) {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="sticky top-0 border-b border-line bg-card text-muted">
          {columns.map((column) => (
            <th key={column.key} className="py-1.5 pr-3 font-medium">
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            className={`border-b border-line/70 last:border-b-0 ${
              onRowClick ? 'cursor-pointer hover:bg-paper' : ''
            } ${selectedId === row.id ? 'bg-accent-soft' : ''}`}
            onClick={() => onRowClick?.(row.id)}
          >
            {columns.map((column, index) => (
              <td
                key={column.key}
                className={`whitespace-nowrap py-2 pr-4 ${index === 0 ? 'font-medium' : ''} ${
                  column.muted ? 'text-muted' : ''
                }`}
              >
                {row[column.key] || '—'}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'departments', label: '부서' },
  { id: 'employees', label: '직원' },
  { id: 'items', label: '품목' },
  { id: 'partners', label: '거래처' },
  { id: 'warehouses', label: '창고' },
  { id: 'fields', label: '필드' },
]
const FIELD_ENTITIES: { id: MasterFieldEntity; label: string }[] = [
  { id: 'employee', label: '직원' },
  { id: 'item', label: '품목' },
  { id: 'partner', label: '거래처' },
  { id: 'department', label: '부서' },
  { id: 'warehouse', label: '창고' },
]

export function MasterDataPage() {
  const { guest, sqlite, loading, configured, user, companies, companyId, sessionReady, setCompanyId } =
    useWorkAccess()
  const [tab, setTab] = useState<TabId>('departments')
  const [listTab, setListTab] = useState<TabId>('departments')
  const [rows, setRows] = useState<NamedRow[]>([])
  const [departments, setDepartments] = useState<NamedRow[]>([])
  const [partners, setPartners] = useState<NamedRow[]>([])
  const [fields, setFields] = useState<FieldRow[]>([])
  const [name, setName] = useState('')
  const [minStock, setMinStock] = useState('0')
  const [itemCode, setItemCode] = useState('')
  const [itemUnit, setItemUnit] = useState('개')
  const [purchaseKind, setPurchaseKind] = useState('supply')
  const [purchaseKindName, setPurchaseKindName] = useState('일반 비품')
  const [purchaseKinds, setPurchaseKinds] = useState<PurchaseKindRow[]>(
    PURCHASE_KINDS.map((item) => ({ id: item.id, name: item.label })),
  )
  const [itemPartnerId, setItemPartnerId] = useState('')
  const [selectedItemId, setSelectedItemId] = useState('')
  const [partnerPhone, setPartnerPhone] = useState('')
  const [partnerMemo, setPartnerMemo] = useState('')
  const [selectedPartnerId, setSelectedPartnerId] = useState('')
  const [selectedNamedId, setSelectedNamedId] = useState('')
  const [partnerFileName, setPartnerFileName] = useState('')
  const [partnerHasFile, setPartnerHasFile] = useState(false)
  const [pendingPartnerFile, setPendingPartnerFile] = useState<{
    fileName: string
    fileMime: string
    fileBase64: string
  } | null>(null)
  const partnerFileInput = useRef<HTMLInputElement>(null)
  const [departmentId, setDepartmentId] = useState('')
  const [fieldEntity, setFieldEntity] = useState<MasterFieldEntity>('employee')
  const [fieldKey, setFieldKey] = useState('employee_no')
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [ready, setReady] = useState(() => sqlite.isOpen(sqlite.companyId))
  const [openFailed, setOpenFailed] = useState(false)
  const opening = useRef(false)

  useEffect(() => {
    if (!companyId || opening.current || openFailed) return
    void openCompany(companyId)
  }, [companyId, openFailed])

  async function openCompany(nextId: string, force = false) {
    if (!mayOpenCompanyWork(guest, nextId, companies)) return
    opening.current = true
    setCompanyId(nextId)
    setMessage('')
    setNotice('')
    setOpenFailed(false)
    try {
      await sqlite.open(nextId, { force })
      assertGuestOpensMemory(guest, sqlite.vfsName)
      setReady(sqlite.persistOk)
      if (!sqlite.persistOk) {
        setOpenFailed(true)
        setMessage('이 브라우저에서 영속 DB를 열 수 없습니다. 지정 Chrome에서 초기 설정을 먼저 하세요.')
        return
      }
      if (!guest) {
        await writeDefaultMaster(sqlite, { companyCode: companies.find((row) => row.id === nextId)?.company_code })
        await retireSupplyAssets(sqlite)
      }
      setNotice(workOpenedNotice(guest))
      await reload(tab)
    } catch (error) {
      setReady(false)
      setOpenFailed(true)
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      opening.current = false
    }
  }

  async function reload(nextTab = tab) {
    const defs = await sqlite.query<FieldRow>(
      'select entity, key, label from custom_field_defs order by entity, key',
    )
    setFields(defs)
    const deptRows = await sqlite.query<NamedRow>(
      `select id, name from departments where ${ACTIVE_MASTER_WHERE} order by name`,
    )
    setDepartments(deptRows)
    if (!departmentId && deptRows[0]) setDepartmentId(deptRows[0].id)
    const partnerRows = await sqlite.query<NamedRow>(
      `select id, name from partners where ${ACTIVE_MASTER_WHERE} order by name`,
    )
    setPartners(partnerRows)
    const kindRows = await sqlite.query<PurchaseKindRow>(
      'select id, name, active from purchase_kinds order by name',
    )
    setPurchaseKinds(kindRows.length ? kindRows : PURCHASE_KINDS.map((item) => ({ id: item.id, name: item.label })))
    if (nextTab === 'fields') {
      setRows([])
      setListTab(nextTab)
      return
    }
    assertMasterTable(nextTab)
    const named =
      nextTab === 'employees'
        ? await sqlite.query<NamedRow>(
            'select id, name, department_id, title, left_at from employees order by name',
          )
        : nextTab === 'items'
          ? await sqlite.query<NamedRow>(
              'select id, name, stock_managed, asset_managed, min_stock, code, unit, purchase_kind, partner_id from items where coalesce(active, 1) = 1 order by name',
            )
          : nextTab === 'partners'
            ? await sqlite.query<NamedRow>(
                `select id, name, phone, memo, file_name,
                  case when file_base64 is not null and length(file_base64) > 0 then 1 else 0 end as has_file
                 from partners where ${ACTIVE_MASTER_WHERE} order by name`,
              )
            : await sqlite.query<NamedRow>(
                `select id, name from ${nextTab} where ${ACTIVE_MASTER_WHERE} order by name`,
              )
    setRows(named)
    setListTab(nextTab)
  }

  useEffect(() => {
    if (!companyId || !ready) return
    void reload(tab)
  }, [tab, ready, companyId])

  function writingAllowed() {
    if (canWriteOpenedCompany(guest, companyId, sqlite.companyId)) return true
    setMessage('연결된 회사 원본만 저장합니다.')
    return false
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!ready || !name.trim() || !writingAllowed()) return
    setMessage('')
    const operationId = crypto.randomUUID()
    try {
      if (tab === 'fields') {
        const entity = fieldEntity
        const key = fieldKey.trim() || 'custom_field'
        const result = await sqlite.runOnce(operationId, async () => {
          await sqlite.exec(
            'insert or replace into custom_field_defs(entity, key, label) values(?, ?, ?)',
            [entity, key, name.trim()],
          )
          return { entity, key, label: name.trim() }
        })
        setNotice(`필드 저장 (${result.status})`)
      } else {
        assertMasterTable(tab)
        if (tab === 'items') {
          assertUniqueItemName(name, rows)
          assertUniqueItemCode(itemCode, rows)
          assertItemSupplier(itemPartnerId, partners)
        }
        if (tab === 'partners') {
          assertUniquePartnerName(name, rows)
        }
        const row = {
          id: crypto.randomUUID(),
          name: name.trim(),
          createdAt: new Date().toISOString(),
          departmentId: tab === 'employees' ? departmentId || undefined : undefined,
          minStock: tab === 'items' ? Number(minStock) || 0 : undefined,
          code: tab === 'items' ? itemCode : undefined,
          unit: tab === 'items' ? itemUnit : undefined,
          purchaseKind: tab === 'items' ? purchaseKind : undefined,
          kinds: tab === 'items' ? activePurchaseKinds() : undefined,
          partnerId: tab === 'items' ? itemPartnerId : undefined,
          phone: tab === 'partners' ? partnerPhone : undefined,
          memo: tab === 'partners' ? partnerMemo : undefined,
          fileName: tab === 'partners' ? pendingPartnerFile?.fileName : undefined,
          fileMime: tab === 'partners' ? pendingPartnerFile?.fileMime : undefined,
          fileBase64: tab === 'partners' ? pendingPartnerFile?.fileBase64 : undefined,
        }
        const stmt = masterInsertStatement(tab, row)
        const result = await sqlite.runOnce(operationId, async () => {
          await sqlite.exec(stmt.sql, stmt.params)
          return row
        })
        setNotice(`${TABS.find((item) => item.id === tab)?.label} 저장 (${result.status})`)
      }
      setName('')
      setMinStock('0')
      setItemCode('')
      setItemUnit('개')
      setPurchaseKind('supply')
      setPurchaseKindName('일반 비품')
      setItemPartnerId('')
      setSelectedItemId('')
      resetPartnerForm()
      await reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function saveItemCatalog() {
    if (!ready || !selectedItemId || !writingAllowed()) return
    setMessage('')
    const operationId = crypto.randomUUID()
    try {
      const stmt = itemCatalogUpdateStatement({
        id: selectedItemId,
        name,
        code: itemCode,
        unit: itemUnit,
        minStock: Number(minStock) || 0,
        purchaseKind,
        partnerId: itemPartnerId,
        kinds: activePurchaseKinds(),
      })
      assertUniqueItemName(name, rows, selectedItemId)
      assertUniqueItemCode(itemCode, rows, selectedItemId)
      assertItemSupplier(itemPartnerId, partners)
      const result = await sqlite.runOnce(operationId, async () => {
        await sqlite.exec(stmt.sql, stmt.params)
        return { itemId: selectedItemId, name: stmt.params[0], code: stmt.params[1] }
      })
      setNotice(`품목 저장 (${result.status})`)
      await reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  function resetPartnerForm() {
    setPartnerPhone('')
    setPartnerMemo('')
    setSelectedPartnerId('')
    setPartnerFileName('')
    setPartnerHasFile(false)
    setPendingPartnerFile(null)
    if (partnerFileInput.current) partnerFileInput.current.value = ''
  }

  async function pickPartnerFile(file: File) {
    setMessage('')
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const attached = partnerAttachment({ name: file.name, mime: file.type, bytes })
      setPendingPartnerFile(attached)
      setPartnerFileName(attached.fileName)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
      if (partnerFileInput.current) partnerFileInput.current.value = ''
    }
  }

  async function savePartner() {
    if (!ready || !selectedPartnerId || !writingAllowed()) return
    setMessage('')
    const operationId = crypto.randomUUID()
    try {
      assertUniquePartnerName(name, rows, selectedPartnerId)
      const stmt = partnerUpdateStatement({
        id: selectedPartnerId,
        name,
        phone: partnerPhone,
        memo: partnerMemo,
        fileName: pendingPartnerFile?.fileName,
        fileMime: pendingPartnerFile?.fileMime,
        fileBase64: pendingPartnerFile?.fileBase64,
      })
      const result = await sqlite.runOnce(operationId, async () => {
        await sqlite.exec(stmt.sql, stmt.params)
        return { partnerId: selectedPartnerId, name: stmt.params[0] }
      })
      setNotice(`거래처 저장 (${result.status})`)
      if (pendingPartnerFile) setPartnerHasFile(true)
      setPendingPartnerFile(null)
      if (partnerFileInput.current) partnerFileInput.current.value = ''
      await reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function downloadPartnerFile() {
    if (!selectedPartnerId) return
    setMessage('')
    try {
      const original = await loadPartnerOriginal(sqlite, selectedPartnerId)
      const url = URL.createObjectURL(new Blob([toArrayBuffer(original.bytes)], { type: original.fileMime }))
      const link = document.createElement('a')
      link.href = url
      link.download = original.fileName
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  function selectedDeactivateId() {
    if (tab === 'items') return selectedItemId
    if (tab === 'partners') return selectedPartnerId
    if (tab === 'departments' || tab === 'warehouses') return selectedNamedId
    return ''
  }

  async function deactivateRow() {
    if (!ready || tab === 'fields' || tab === 'employees' || !writingAllowed()) return
    setMessage('')
    const operationId = crypto.randomUUID()
    try {
      const stmt = masterDeactivateStatement(tab, selectedDeactivateId())
      const result = await sqlite.runOnce(operationId, async () => {
        await sqlite.exec(stmt.sql, stmt.params)
        return { id: stmt.params[0] }
      })
      setNotice(`${TABS.find((item) => item.id === tab)?.label} 사용 안 함 (${result.status})`)
      setSelectedItemId('')
      setSelectedPartnerId('')
      setSelectedNamedId('')
      setName('')
      await reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  function activePurchaseKinds() {
    return purchaseKinds.filter((row) => row.active !== 0)
  }

  function selectPurchaseKind(id: string) {
    setPurchaseKind(id)
    const row = purchaseKinds.find((item) => item.id === id)
    setPurchaseKindName(row?.name || purchaseKindLabel(id, purchaseKinds))
  }

  async function addPurchaseKind() {
    if (!ready || !writingAllowed()) return
    setMessage('')
    try {
      assertUniquePurchaseKindName(purchaseKindName, purchaseKinds)
      const row = {
        id: `kind-${crypto.randomUUID()}`,
        name: purchaseKindName,
        createdAt: new Date().toISOString(),
      }
      const stmt = purchaseKindInsertStatement(row)
      const result = await sqlite.runOnce(crypto.randomUUID(), async () => {
        await sqlite.exec(stmt.sql, stmt.params)
        return row
      })
      setPurchaseKind(row.id)
      setNotice(`구매 구분 추가 (${result.status})`)
      await reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function savePurchaseKind() {
    if (!ready || !writingAllowed()) return
    setMessage('')
    try {
      assertPurchaseKind(purchaseKind, activePurchaseKinds())
      assertUniquePurchaseKindName(purchaseKindName, purchaseKinds, purchaseKind)
      const stmt = purchaseKindRenameStatement(purchaseKind, purchaseKindName)
      const result = await sqlite.runOnce(crypto.randomUUID(), async () => {
        await sqlite.exec(stmt.sql, stmt.params)
        return { id: purchaseKind }
      })
      setNotice(`구매 구분 저장 (${result.status})`)
      await reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function deactivatePurchaseKind() {
    if (!ready || !writingAllowed()) return
    setMessage('')
    try {
      const remaining = activePurchaseKinds().filter((row) => row.id !== purchaseKind)
      if (!remaining.length) throw new Error('구매 구분은 하나 이상 남겨 두세요.')
      const stmt = purchaseKindDeactivateStatement(purchaseKind)
      const result = await sqlite.runOnce(crypto.randomUUID(), async () => {
        await sqlite.exec(stmt.sql, stmt.params)
        return { id: purchaseKind }
      })
      selectPurchaseKind(remaining[0].id)
      setNotice(`구매 구분 사용 안 함 (${result.status})`)
      await reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

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
        loginHint="기준정보는 로그인 후 지정 PC에서 다룹니다."
      />
    )
  }

  const fieldHint =
    tab === 'fields'
      ? '라벨'
      : tab === 'employees'
        ? '직원 이름'
        : `${TABS.find((item) => item.id === tab)?.label} 이름`
  const tabLabel = TABS.find((item) => item.id === tab)?.label ?? '목록'
  const table =
    tab === 'employees'
      ? {
          columns: [
            { key: 'name', label: '이름' },
            { key: 'department', label: '부서', muted: true },
            { key: 'title', label: '직위', muted: true },
            { key: 'status', label: '상태', muted: true },
          ],
          rows: rows.map((row) => ({
            id: row.id,
            name: row.name,
            department: departments.find((dept) => dept.id === row.department_id)?.name ?? '',
            title: row.title?.trim() ?? '',
            status: row.left_at ? '퇴사' : '재직',
          })),
        }
      : tab === 'items'
        ? {
            columns: [
              { key: 'code', label: '코드', muted: true },
              { key: 'name', label: '이름' },
              { key: 'kind', label: '구분', muted: true },
              { key: 'purchase', label: '구매', muted: true },
              { key: 'supplier', label: '공급사', muted: true },
              { key: 'unit', label: '단위', muted: true },
              { key: 'minStock', label: '최소재고', muted: true },
            ],
            rows: [...rows]
              .sort(
                (a, b) =>
                  itemKindLabel(a).localeCompare(itemKindLabel(b), 'ko') ||
                  a.name.localeCompare(b.name, 'ko'),
              )
              .map((row) => ({
                id: row.id,
                code: row.code?.trim() ?? '',
                name: row.name,
                kind: itemKindLabel(row),
                purchase: itemKindLabel(row) === '회사 자산' ? '' : purchaseKindLabel(row.purchase_kind, purchaseKinds),
                supplier: partners.find((partner) => partner.id === row.partner_id)?.name ?? '',
                unit: row.unit?.trim() || '개',
                minStock: itemKindLabel(row) === '비품' ? String(row.min_stock ?? 0) : '',
              })),
          }
        : tab === 'partners'
          ? {
              columns: [
                { key: 'name', label: '이름' },
                { key: 'phone', label: '연락처', muted: true },
                { key: 'memo', label: '메모', muted: true },
                { key: 'file', label: '첨부', muted: true },
              ],
              rows: rows.map((row) => ({
                id: row.id,
                name: row.name,
                phone: row.phone?.trim() ?? '',
                memo: row.memo?.trim() ?? '',
                file: row.has_file === 1 ? row.file_name?.trim() || '있음' : '',
              })),
            }
        : tab === 'fields'
          ? {
              columns: [
                { key: 'entity', label: '대상', muted: true },
                { key: 'key', label: '키', muted: true },
                { key: 'label', label: '라벨' },
              ],
              rows: fields.map((field) => ({
                id: `${field.entity}-${field.key}`,
                entity: FIELD_ENTITIES.find((item) => item.id === field.entity)?.label ?? field.entity,
                key: field.key,
                label: field.label,
              })),
            }
          : {
              columns: [{ key: 'name', label: '이름' }],
              rows: rows.map((row) => ({ id: row.id, name: row.name })),
            }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">기준정보</h1>
          <p className="mt-1 text-sm text-muted">
            회사별 로컬 원본에만 저장합니다. 같은 추가는 한 번만 반영됩니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {guest ? (
            <p className="rounded border border-line px-3 py-2 text-sm text-muted">샘플 회사</p>
          ) : (
            <>
              <WorkCompanyControl
                guest={false}
                companies={companies}
                companyId={companyId}
                onChange={(id) => {
                  setReady(false)
                  setOpenFailed(false)
                  void openCompany(id, true)
                }}
              />
              {showsWorkDbReopen(openFailed) ? (
                <button
                  type="button"
                  className="rounded border border-line px-3 py-2 text-sm"
                  disabled={!companyId}
                  onClick={() => {
                    setReady(false)
                    setOpenFailed(false)
                    void openCompany(companyId, true)
                  }}
                >
                  이 회사 DB 다시 열기
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
      <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)] lg:items-start">
      <section className="rounded-lg border border-line bg-card p-4">
      <div className="flex flex-wrap gap-2 text-sm">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'font-semibold text-accent' : 'text-muted'}
            onClick={() => {
              setSelectedItemId('')
              setMinStock('0')
              setItemCode('')
              setItemUnit('개')
              setPurchaseKind('supply')
              setPurchaseKindName('일반 비품')
              setItemPartnerId('')
              setSelectedNamedId('')
              resetPartnerForm()
              setTab(item.id)
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <form className="mt-3 grid gap-2" onSubmit={onSubmit} onKeyDown={preventImeEnterSubmit}>
        {tab === 'items' ? (
          <>
            <label className="text-sm">
              이름
              <input
                className="mt-1 w-full rounded border border-line px-3 py-2 text-sm"
                placeholder="품목 이름"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">
                코드
                <input
                  className="mt-1 w-full rounded border border-line px-3 py-2 text-sm"
                  placeholder={itemCodePlaceholder()}
                  value={itemCode}
                  onChange={(e) => setItemCode(e.target.value)}
                />
              </label>
              <label className="text-sm">
                단위
                <input
                  className="mt-1 w-full rounded border border-line px-3 py-2 text-sm"
                  placeholder="개"
                  value={itemUnit}
                  onChange={(e) => setItemUnit(e.target.value)}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">
                최소재고
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="mt-1 w-full rounded border border-line px-3 py-2 text-sm"
                  value={minStock}
                  onChange={(e) => setMinStock(e.target.value)}
                />
              </label>
              <label className="text-sm">
                구매 구분
                <select
                  className="mt-1 w-full rounded border border-line px-3 py-2 text-sm"
                  value={purchaseKind}
                  onChange={(e) => selectPurchaseKind(e.target.value)}
                >
                  {activePurchaseKinds().map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="text-sm">
              구분 이름
              <input
                className="mt-1 w-full rounded border border-line px-3 py-2 text-sm"
                placeholder="일반 비품"
                value={purchaseKindName}
                onChange={(e) => setPurchaseKindName(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!ready}
                className="rounded border border-line px-3 py-2 text-sm disabled:opacity-50"
                onClick={() => void addPurchaseKind()}
              >
                구분 추가
              </button>
              <button
                type="button"
                disabled={!ready || !purchaseKind}
                className="rounded border border-line px-3 py-2 text-sm disabled:opacity-50"
                onClick={() => void savePurchaseKind()}
              >
                구분 저장
              </button>
              <button
                type="button"
                disabled={!ready || !purchaseKind}
                className="rounded border border-line px-3 py-2 text-sm disabled:opacity-50"
                onClick={() => void deactivatePurchaseKind()}
              >
                구분 사용 안 함
              </button>
            </div>
            <label className="text-sm">
              공급사
              <select
                className="mt-1 w-full rounded border border-line px-3 py-2 text-sm"
                value={itemPartnerId}
                onChange={(e) => setItemPartnerId(e.target.value)}
              >
                <option value="">없음</option>
                {partners.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={!ready}
                className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                추가
              </button>
              <button
                type="button"
                disabled={!ready || !selectedItemId}
                className="rounded border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50"
                onClick={() => void saveItemCatalog()}
              >
                품목 저장
              </button>
              <button
                type="button"
                disabled={!ready || !selectedItemId}
                className="rounded border border-line px-4 py-2 text-sm disabled:opacity-50"
                onClick={() => void deactivateRow()}
              >
                사용 안 함
              </button>
            </div>
          </>
        ) : tab === 'partners' ? (
          <>
            <label className="text-sm">
              이름
              <input
                className="mt-1 w-full rounded border border-line px-3 py-2 text-sm"
                placeholder="거래처 이름"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="text-sm">
              연락처
              <input
                className="mt-1 w-full rounded border border-line px-3 py-2 text-sm"
                placeholder="02-1234-5678"
                value={partnerPhone}
                onChange={(e) => setPartnerPhone(e.target.value)}
              />
            </label>
            <label className="text-sm">
              메모
              <textarea
                className="mt-1 min-h-16 w-full rounded border border-line px-3 py-2 text-sm"
                placeholder="공급사·계약 상대 메모"
                value={partnerMemo}
                onChange={(e) => setPartnerMemo(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={partnerFileInput}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void pickPartnerFile(file)
                }}
              />
              <button
                type="button"
                disabled={!ready}
                className="rounded border border-line px-3 py-2 text-sm font-semibold disabled:opacity-50"
                onClick={() => partnerFileInput.current?.click()}
              >
                첨부
              </button>
              {partnerHasFile && !pendingPartnerFile ? (
                <button
                  type="button"
                  disabled={!ready || !selectedPartnerId}
                  className="rounded border border-line px-3 py-2 text-sm disabled:opacity-50"
                  onClick={() => void downloadPartnerFile()}
                >
                  {partnerFileName || '첨부 받기'}
                </button>
              ) : (
                <span className="text-xs text-muted">{partnerFileName || 'PDF·PNG·JPEG 8MB'}</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={!ready}
                className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                추가
              </button>
              <button
                type="button"
                disabled={!ready || !selectedPartnerId}
                className="rounded border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50"
                onClick={() => void savePartner()}
              >
                거래처 저장
              </button>
              <button
                type="button"
                disabled={!ready || !selectedPartnerId}
                className="rounded border border-line px-4 py-2 text-sm disabled:opacity-50"
                onClick={() => void deactivateRow()}
              >
                사용 안 함
              </button>
            </div>
          </>
        ) : (
          <>
        {tab === 'fields' ? (
          <>
            <select
              className="rounded border border-line px-3 py-2 text-sm"
              value={fieldEntity}
              onChange={(e) => setFieldEntity(e.target.value as MasterFieldEntity)}
            >
              {FIELD_ENTITIES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <input
              className="w-40 rounded border border-line px-3 py-2 text-sm"
              placeholder="필드 키"
              value={fieldKey}
              onChange={(e) => setFieldKey(e.target.value)}
            />
          </>
        ) : null}
        {tab === 'employees' ? (
          <select
            className="rounded border border-line px-3 py-2 text-sm"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
          >
            {departments.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </select>
        ) : null}
        <div className="flex flex-wrap gap-2">
        <input
          className="min-w-48 flex-1 rounded border border-line px-3 py-2 text-sm"
          placeholder={fieldHint}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="submit"
          disabled={!ready}
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          추가
        </button>
        {tab === 'departments' || tab === 'warehouses' ? (
          <button
            type="button"
            disabled={!ready || !selectedNamedId}
            className="rounded border border-line px-4 py-2 text-sm disabled:opacity-50"
            onClick={() => void deactivateRow()}
          >
            사용 안 함
          </button>
        ) : null}
        </div>
          </>
        )}
      </form>
      {notice ? <p className="text-sm text-ok">{notice}</p> : null}
      {message ? <p className="text-sm text-danger">{message}</p> : null}
      </section>
      <section className="max-h-[calc(100svh-10rem)] overflow-auto rounded-lg border border-line bg-card p-4">
      {tab === listTab && (tab === 'fields' ? fields.length : rows.length) ? (
        <>
          <h2 className="mb-2 text-base font-semibold">
            {tabLabel} {tab === 'fields' ? fields.length : rows.length}
          </h2>
          <MasterTable
            columns={table.columns}
            rows={table.rows}
            selectedId={
              tab === 'items'
                ? selectedItemId
                : tab === 'partners'
                  ? selectedPartnerId
                  : tab === 'departments' || tab === 'warehouses'
                    ? selectedNamedId
                    : undefined
            }
            onRowClick={
              tab === 'items'
                ? (id) => {
                    const row = rows.find((item) => item.id === id)
                    setSelectedItemId(id)
                    setName(row?.name ?? '')
                    setItemCode(row?.code ?? '')
                    setItemUnit(row?.unit?.trim() || '개')
                    setPurchaseKind(
                      row?.purchase_kind && activePurchaseKinds().some((kind) => kind.id === row.purchase_kind)
                        ? row.purchase_kind
                        : activePurchaseKinds()[0]?.id ?? 'supply',
                    )
                    setPurchaseKindName(
                      purchaseKindLabel(row?.purchase_kind, purchaseKinds),
                    )
                    setItemPartnerId(row?.partner_id ?? '')
                    setMinStock(String(row?.min_stock ?? 0))
                    setMessage('')
                    setNotice('')
                  }
                : tab === 'partners'
                  ? (id) => {
                      const row = rows.find((item) => item.id === id)
                      setSelectedPartnerId(id)
                      setName(row?.name ?? '')
                      setPartnerPhone(row?.phone ?? '')
                      setPartnerMemo(row?.memo ?? '')
                      setPartnerFileName(row?.file_name ?? '')
                      setPartnerHasFile(row?.has_file === 1)
                      setPendingPartnerFile(null)
                      if (partnerFileInput.current) partnerFileInput.current.value = ''
                      setMessage('')
                      setNotice('')
                    }
                  : tab === 'departments' || tab === 'warehouses'
                    ? (id) => {
                        const row = rows.find((item) => item.id === id)
                        setSelectedNamedId(id)
                        setName(row?.name ?? '')
                        setMessage('')
                        setNotice('')
                      }
                    : undefined
            }
          />
        </>
      ) : (
        <p className="text-sm text-muted">
          {!ready
            ? '회사 DB를 여는 중입니다.'
            : tab !== listTab
              ? '목록을 불러오는 중입니다.'
              : '아직 항목이 없습니다. 왼쪽에서 추가하세요.'}
        </p>
      )}
      </section>
      </div>
    </div>
  )
}
