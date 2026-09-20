import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import {
  assertContractFile,
  contractAmountText,
  contractPeriod,
  contractPhase,
  defaultContractTab,
  executeDraftContract,
  filterContracts,
  groupContracts,
  hashFileBytes,
  loadContractOriginal,
  loadContracts,
  toArrayBuffer,
  type ContractDraft,
  type ContractPhase,
} from '../lib/contracts/book'
import { applyOcrCandidates } from '../lib/contracts/parseFields'
import { writeDefaultMaster } from '../lib/master/book'
import { getCompanySqlite } from '../lib/sqlite/instance'
import { useCompanySession } from '../lib/companySession'

const sqlite = getCompanySqlite()

function todayStamp() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
}

function emptyForm() {
  return {
    title: '',
    contractNo: '',
    counterparty: '',
    signedAt: todayStamp(),
    startAt: todayStamp(),
    endAt: '',
    amount: '',
    ownerName: '',
  }
}

export function ContractsPage() {
  const { configured, loading, user } = useAuth()
  const { companies, companyId, setCompanyId } = useCompanySession(Boolean(user))
  const [rows, setRows] = useState<ContractDraft[]>([])
  const [query, setQuery] = useState('')
  const [lifeTab, setLifeTab] = useState<ContractPhase>('active')
  const [form, setForm] = useState(emptyForm)
  const [file, setFile] = useState<File | null>(null)
  const [fileKey, setFileKey] = useState(0)
  const [selectedId, setSelectedId] = useState('')
  const [ocrMessage, setOcrMessage] = useState('')
  const [ocrText, setOcrText] = useState('')
  const [ocrReviewed, setOcrReviewed] = useState(false)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [message, setMessage] = useState('')
  const [ready, setReady] = useState(() => sqlite.isOpen(sqlite.companyId))
  const opening = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const ocrPanel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!companyId || opening.current) return
    void openCompany(companyId)
  }, [companyId])

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
      const nextRows = await loadContracts(sqlite)
      const groups = groupContracts(nextRows, todayStamp())
      setRows(nextRows)
      setSelectedId((prev) => {
        const existing = nextRows.find((row) => row.id === prev)
        if (existing) {
          setLifeTab(contractPhase(existing.endAt))
          return existing.id
        }
        const tab = defaultContractTab(groups)
        setLifeTab(tab)
        return groups.find((section) => section.phase === tab)?.contracts[0]?.id ?? ''
      })
    } catch (error) {
      setReady(false)
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      opening.current = false
    }
  }

  function resetForm() {
    setForm(emptyForm())
    setFile(null)
    setFileKey((key) => key + 1)
    setOcrText('')
    setOcrReviewed(false)
    setOcrMessage('')
  }

  async function pickFile(next: File | null) {
    setMessage('')
    setNotice('')
    setOcrText('')
    setOcrReviewed(false)
    if (!next) {
      setFile(null)
      return
    }
    try {
      assertContractFile(next.size, next.type, next.name)
      const bytes = new Uint8Array(await next.arrayBuffer())
      const hash = await hashFileBytes(bytes)
      if (rows.some((row) => row.fileHash === hash)) {
        throw new Error('같은 원본 파일은 계약을 한 번만 만듭니다.')
      }
      setFile(next)
      setOcrBusy(true)
      setOcrMessage('원본에서 글자를 읽는 중입니다. 처음이면 1분 정도 걸릴 수 있습니다.')
      ocrPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const { extractLocalContract } = await import('../lib/contracts/localOcr')
      const result = await extractLocalContract({
        bytes,
        fileName: next.name,
        fileMime: next.type,
        onProgress: setOcrMessage,
      })
      setForm((prev) => applyOcrCandidates(prev, result.candidates))
      setOcrText(result.text ?? '')
      setOcrReviewed(true)
      setOcrMessage(result.message)
    } catch (error) {
      setFile(null)
      setFileKey((key) => key + 1)
      setMessage(error instanceof Error ? error.message : String(error))
      setOcrMessage('')
      ocrPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } finally {
      setOcrBusy(false)
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!ready) return
    setMessage('')
    setNotice('')
    try {
      let fileName: string | undefined
      let fileHash: string | undefined
      let fileMime: string | undefined
      let fileBytes: Uint8Array | undefined
      if (file) {
        const bytes = new Uint8Array(await file.arrayBuffer())
        fileName = file.name
        fileHash = await hashFileBytes(bytes)
        fileMime = file.type
        fileBytes = bytes
      }
      const id = crypto.randomUUID()
      const result = await executeDraftContract(sqlite, {
        operationId: crypto.randomUUID(),
        id,
        title: form.title,
        contractNo: form.contractNo,
        counterparty: form.counterparty,
        signedAt: form.signedAt,
        startAt: form.startAt,
        endAt: form.endAt || undefined,
        amount: form.amount ? Number(form.amount) : undefined,
        ownerName: form.ownerName,
        fileName,
        fileHash,
        fileMime,
        fileBytes,
        ocrReviewed: Boolean(fileBytes) && ocrReviewed,
      })
      setNotice(
        result.status === 'duplicate'
          ? '같은 초안은 한 번만 반영됩니다.'
          : fileBytes
            ? '확인한 값으로 초안과 원본을 저장했습니다. OCR만으로 체결하지 않았습니다.'
            : '계약 초안을 저장했습니다. OCR로 체결하지 않았습니다.',
      )
      const nextRows = await loadContracts(sqlite)
      setRows(nextRows)
      setLifeTab(contractPhase(form.endAt || undefined))
      setSelectedId(id)
      resetForm()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function downloadOriginal(id: string) {
    setMessage('')
    try {
      const original = await loadContractOriginal(sqlite, id)
      const url = URL.createObjectURL(new Blob([toArrayBuffer(original.bytes)], { type: original.fileMime }))
      const link = document.createElement('a')
      link.href = url
      link.download = original.fileName
      link.click()
      URL.revokeObjectURL(url)
      setNotice(`원본 ${original.fileName}을 이 PC에서 받았습니다.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const groups = useMemo(() => groupContracts(rows, todayStamp()), [rows])
  const visible = useMemo(
    () => filterContracts(groups.find((section) => section.phase === lifeTab)?.contracts ?? [], query),
    [groups, lifeTab, query],
  )
  const selected = rows.find((row) => row.id === selectedId)

  if (loading) return <p className="text-sm text-muted">세션을 확인하는 중입니다.</p>
  if (!configured) return <p className="text-sm text-muted">중앙 운영이 연결되지 않았습니다.</p>
  if (!user) {
    return (
      <p className="text-sm">
        계약은 로그인 후 지정 PC에서 다룹니다.{' '}
        <Link className="text-accent underline" to="/login">
          로그인
        </Link>
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">계약</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            원본 PDF·PNG·JPEG를 올리면 이 PC에서 글자를 읽어 칸을 채웁니다. 확인하고 고친 뒤 초안만 저장합니다.
            같은 파일은 한 번만 받습니다. OCR만으로 체결하지 않습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
          <Link className="rounded border border-line px-3 py-2 text-sm" to="/master">
            거래처
          </Link>
          <button
            type="button"
            className="rounded border border-line px-3 py-2 text-sm"
            onClick={() => {
              setSelectedId('')
              setNotice('')
              setMessage('')
              resetForm()
            }}
          >
            새 초안
          </button>
        </div>
      </div>
      {ocrMessage ? <p className="text-sm text-accent">{ocrMessage}</p> : null}
      {notice ? <p className="text-sm text-ok">{notice}</p> : null}
      {message ? <p className="text-sm text-danger">{message}</p> : null}

      <div className="grid min-h-0 gap-4 xl:grid-cols-[16rem_minmax(0,1fr)_minmax(22rem,1fr)] xl:items-start">
        <nav className="flex max-h-[calc(100svh-10rem)] min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-card">
          <div className="grid shrink-0 grid-cols-2 border-b border-line">
            {groups.map((section) => {
              const active = section.phase === lifeTab
              return (
                <button
                  key={section.phase}
                  type="button"
                  className={`px-1 py-2 text-center text-xs font-semibold ${
                    active ? 'bg-accent-soft' : 'text-muted hover:bg-paper'
                  }`}
                  onClick={() => {
                    setLifeTab(section.phase)
                    setMessage('')
                    if (!section.contracts.some((row) => row.id === selectedId)) {
                      setSelectedId(section.contracts[0]?.id ?? '')
                    }
                  }}
                >
                  <span className="block whitespace-nowrap">{section.label}</span>
                  <span className="mt-0.5 block font-medium">{section.contracts.length}</span>
                </button>
              )
            })}
          </div>
          <div className="shrink-0 border-b border-line p-3">
            <input
              className="w-full rounded border border-line px-3 py-2 text-sm"
              placeholder="번호·계약·상대방·담당자"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
          {visible.length ? (
            visible.map((row) => (
              <button
                key={row.id}
                type="button"
                className={`flex w-full flex-col items-start border-b border-line/70 px-3 py-2 text-left last:border-b-0 ${
                  selectedId === row.id ? 'bg-accent-soft' : 'hover:bg-paper'
                } ${lifeTab === 'expired' ? 'text-muted' : ''}`}
                onClick={() => {
                  setSelectedId(row.id)
                  setMessage('')
                }}
              >
                <span className="font-medium">{row.title}</span>
                <span className="mt-0.5 text-xs text-muted">
                  {row.contractNo ? `${row.contractNo} · ` : ''}
                  {row.counterparty}
                </span>
                <span className="mt-0.5 text-xs text-muted">
                  {contractPeriod(row)} · {contractAmountText(row.amount)}
                  {row.hasOriginal ? ` · ${row.fileName}` : ' · 원본 없음'}
                  {row.ocrStatus === 'reviewed' ? ' · OCR 확인' : ''}
                </span>
              </button>
            ))
          ) : (
            <p className="p-3 text-sm text-muted">
              {ready
                ? query.trim()
                  ? '검색 결과가 없습니다.'
                  : lifeTab === 'expired'
                    ? '만료된 계약이 없습니다.'
                    : '진행 중인 계약이 없습니다.'
                : '회사 DB를 여는 중입니다.'}
            </p>
          )}
          </div>
        </nav>

        {selected ? (
            <section className="max-h-[calc(100svh-10rem)] overflow-auto rounded-lg border border-line bg-card p-4 text-sm">
              <h2 className="text-lg font-semibold">{selected.title}</h2>
              <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-muted">계약번호</dt>
                  <dd>{selected.contractNo || '없음'}</dd>
                </div>
                <div>
                  <dt className="text-muted">상대방</dt>
                  <dd>{selected.counterparty}</dd>
                </div>
                <div>
                  <dt className="text-muted">담당자</dt>
                  <dd>{selected.ownerName || '없음'}</dd>
                </div>
                <div>
                  <dt className="text-muted">체결일</dt>
                  <dd>{selected.signedAt || '없음'}</dd>
                </div>
                <div>
                  <dt className="text-muted">기간</dt>
                  <dd>
                    {contractPeriod(selected)} · {contractPhase(selected.endAt) === 'expired' ? '만료' : '계약중'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">금액</dt>
                  <dd>{contractAmountText(selected.amount)}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted">상태</dt>
                  <dd>{selected.ocrStatus === 'reviewed' ? '초안 · OCR 확인' : '초안'}</dd>
                </div>
              </dl>
              {selected.hasOriginal ? (
                <button
                  type="button"
                  className="mt-4 rounded border border-line px-3 py-1.5 text-xs font-semibold"
                  onClick={() => void downloadOriginal(selected.id)}
                >
                  원본 받기
                </button>
              ) : (
                <p className="mt-4 text-muted">이 초안에는 원본 파일이 없습니다.</p>
              )}
            </section>
          ) : (
            <section className="rounded-lg border border-dashed border-line bg-card p-4 text-sm text-muted">
              왼쪽에서 초안을 고르거나 오른쪽 칸으로 새 초안을 만드세요.
            </section>
          )}

          <form className="grid max-h-[calc(100svh-10rem)] gap-3 overflow-auto rounded-lg border border-line bg-card p-4 sm:grid-cols-2" onSubmit={onSubmit}>
            <h2 className="text-lg font-semibold sm:col-span-2">새 초안</h2>
            <label className="text-sm">
              계약명
              <input
                required
                className="mt-1 w-full rounded border border-line px-3 py-2"
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              계약번호
              <input
                className="mt-1 w-full rounded border border-line px-3 py-2"
                value={form.contractNo}
                onChange={(e) => setForm((prev) => ({ ...prev, contractNo: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              상대방
              <input
                required
                className="mt-1 w-full rounded border border-line px-3 py-2"
                value={form.counterparty}
                onChange={(e) => setForm((prev) => ({ ...prev, counterparty: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              담당자
              <input
                className="mt-1 w-full rounded border border-line px-3 py-2"
                value={form.ownerName}
                onChange={(e) => setForm((prev) => ({ ...prev, ownerName: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              체결일
              <input
                type="date"
                className="mt-1 w-full rounded border border-line px-3 py-2"
                value={form.signedAt}
                onChange={(e) => setForm((prev) => ({ ...prev, signedAt: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              시작일
              <input
                type="date"
                className="mt-1 w-full rounded border border-line px-3 py-2"
                value={form.startAt}
                onChange={(e) => setForm((prev) => ({ ...prev, startAt: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              종료일
              <input
                type="date"
                className="mt-1 w-full rounded border border-line px-3 py-2"
                value={form.endAt}
                onChange={(e) => setForm((prev) => ({ ...prev, endAt: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              금액(원)
              <input
                type="number"
                min="0"
                className="mt-1 w-full rounded border border-line px-3 py-2"
                value={form.amount}
                onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
              />
            </label>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <input
                key={fileKey}
                ref={fileInput}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                className="sr-only"
                onChange={(e) => void pickFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                className="rounded border border-line px-4 py-2 text-sm font-semibold"
                onClick={() => fileInput.current?.click()}
              >
                첨부파일
              </button>
              <span className="text-sm text-muted">{file ? file.name : '선택된 파일 없음 · PDF·PNG·JPEG 8MB'}</span>
            </div>
            <div ref={ocrPanel} className="space-y-2 sm:col-span-2">
              {message ? <p className="text-sm text-danger">{message}</p> : null}
              {ocrBusy ? (
                <p className="text-sm text-muted">
                  {ocrMessage || '원본을 읽는 중입니다. 처음이면 1분 정도 걸릴 수 있습니다.'} 초안 저장은 글자를 읽은 뒤에 하세요.
                </p>
              ) : ocrMessage ? (
                <p className="text-sm text-accent">{ocrMessage}</p>
              ) : null}
              {ocrText ? (
                <label className="text-sm">
                  읽은 글자 (확인하고 위 칸을 고치세요)
                  <textarea
                    readOnly
                    rows={6}
                    className="mt-1 w-full rounded border border-line px-3 py-2 font-mono text-xs"
                    value={ocrText}
                  />
                </label>
              ) : null}
            </div>
            <div className="sm:col-span-2">
              <button type="submit" disabled={!ready || ocrBusy} className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                초안 저장
              </button>
            </div>
          </form>
      </div>
    </div>
  )
}
