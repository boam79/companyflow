import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { WorkGateNotice } from '../components/WorkGateNotice'
import { WorkCompanyControl } from '../components/WorkCompanyControl'
import {
  assertContractFile,
  contractAmountText,
  contractOrderLabel,
  contractPeriod,
  contractPhase,
  contractPhaseCaption,
  defaultContractTab,
  draftSavedNotice,
  emptyContractTabCopy,
  executeDraftContract,
  filterContracts,
  groupContracts,
  hashFileBytes,
  loadContractOriginal,
  loadContractRevisions,
  loadContracts,
  matchPartnerId,
  revisionCaption,
  similarChoiceLead,
  similarDrafts,
  toArrayBuffer,
  type ContractDraft,
  type ContractPhase,
  type ContractRevision,
  type SimilarChoice,
} from '../lib/contracts/book'
import { contractDueNotice } from '../lib/contracts/watch'
import { applyOcrCandidates, formValueForOcrField, reviewedOcrFields } from '../lib/contracts/parseFields'
import {
  describeOcrResult,
  ocrCancelLabel,
  ocrConfirmHint,
  ocrConfirmLabel,
  ocrEvidenceLine,
  ocrFailedMessage,
  ocrJobCaption,
  ocrJobStatus,
  ocrRetryLabel,
  type OcrCandidate,
} from '../lib/contracts/ocr'
import {
  contractFileLimitBytes,
  contractLimitCaption,
  loadContractLimits,
  type ContractLimits,
} from '../lib/contracts/limits'
import { writeDefaultMaster } from '../lib/master/book'
import { canWriteOpenedCompany, mayOpenCompanyWork, workSessionKind } from '../lib/company/workGate'
import { useWorkAccess } from '../lib/guest/workAccess'
import { assertGuestOpensMemory } from '../lib/guest/seed'
import { readCompanyModule } from '../lib/company/moduleAccess'
import { ModuleClosed } from '../components/ModuleClosed'
import { displayCurrencyName, formatCompanyDate, loadCompanyDisplay } from '../lib/company/displayCurrency'
import { countHeading, countLabel, showsEmptyPickHint } from '../lib/company/nav'
import { publicErrorMessage } from '../lib/publicError'
import { ACTIVE_MASTER_WHERE } from '../lib/master/commands'

function emptyForm(today: string) {
  return {
    title: '',
    contractNo: '',
    counterparty: '',
    signedAt: today,
    startAt: today,
    endAt: '',
    amount: '',
    ownerName: '',
    partnerId: '',
    orderId: '',
  }
}

export function ContractsPage() {
  const { guest, sqlite, loading, configured, user, companies, companyId, sessionReady, setCompanyId, href } =
    useWorkAccess()
  const [rows, setRows] = useState<ContractDraft[]>([])
  const [partners, setPartners] = useState<{ id: string; name: string }[]>([])
  const [orders, setOrders] = useState<{ id: string; partnerId?: string; orderDate?: string }[]>([])
  const [revisions, setRevisions] = useState<ContractRevision[]>([])
  const [query, setQuery] = useState('')
  const [lifeTab, setLifeTab] = useState<ContractPhase>('active')
  const [today, setToday] = useState(() => formatCompanyDate(new Date(), 'Asia/Seoul'))
  const [currency, setCurrency] = useState('KRW')
  const [grouping, setGrouping] = useState(true)
  const [limits, setLimits] = useState<ContractLimits>({ maxMb: 8, maxPages: 2 })
  const [form, setForm] = useState(() => emptyForm(formatCompanyDate(new Date(), 'Asia/Seoul')))
  const [file, setFile] = useState<File | null>(null)
  const [fileKey, setFileKey] = useState(0)
  const [selectedId, setSelectedId] = useState('')
  const [ocrMessage, setOcrMessage] = useState('')
  const [ocrText, setOcrText] = useState('')
  const [ocrFields, setOcrFields] = useState<OcrCandidate[]>([])
  const [ocrReviewed, setOcrReviewed] = useState(false)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [message, setMessage] = useState('')
  const [ready, setReady] = useState(() => sqlite.isOpen(sqlite.companyId))
  const [menuOff, setMenuOff] = useState(false)
  const opening = useRef(false)
  const openTicket = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const ocrPanel = useRef<HTMLDivElement>(null)
  const ocrRun = useRef(0)

  useEffect(() => {
    if (!companyId || opening.current) return
    void openCompany(companyId)
  }, [companyId])

  async function openCompany(nextId: string, force = false) {
    if (!mayOpenCompanyWork(guest, nextId, companies)) return
    const ticket = ++openTicket.current
    opening.current = true
    setCompanyId(nextId)
    setRows([])
    setMenuOff(false)
    setMessage('')
    try {
      await sqlite.open(nextId, { force })
      if (ticket !== openTicket.current) return
      assertGuestOpensMemory(guest, sqlite.vfsName)
      setReady(sqlite.persistOk)
      if (!sqlite.persistOk) {
        setMessage('이 브라우저에서 영속 DB를 열 수 없습니다. 지정 Chrome에서 초기 설정을 먼저 하세요.')
        return
      }
      if (sqlite.companyId !== nextId) {
        setRows([])
        setMessage('선택한 회사 원본이 열려 있지 않습니다.')
        return
      }
      const display = guest
        ? { currency: 'KRW', grouping: true, timeZone: 'Asia/Seoul' }
        : await loadCompanyDisplay(sqlite)
      const nextLimits = await loadContractLimits(sqlite)
      const stamp = formatCompanyDate(new Date(), display.timeZone)
      if (ticket !== openTicket.current) return
      setToday(stamp)
      setCurrency(display.currency)
      setGrouping(display.grouping)
      setLimits(nextLimits)
      setForm(emptyForm(stamp))
      if (!guest && !(await readCompanyModule(sqlite, nextId, 'contracts'))) {
        if (ticket !== openTicket.current || sqlite.companyId !== nextId) return
        setMenuOff(true)
        setRows([])
        setReady(true)
        return
      }
      if (ticket !== openTicket.current || sqlite.companyId !== nextId) return
      setMenuOff(false)
      if (!guest) {
        await writeDefaultMaster(sqlite, {
          companyCode: companies.find((row) => row.id === nextId)?.company_code,
        })
      }
      const nextRows = await loadContracts(sqlite)
      if (ticket !== openTicket.current || sqlite.companyId !== nextId) return
      const [partnerRows, orderRows] = await Promise.all([
        sqlite.query<{ id: string; name: string }>(`select id, name from partners where ${ACTIVE_MASTER_WHERE} order by name`),
        sqlite.query<{ id: string; partner_id?: string | null; order_date?: string | null }>(
          'select id, partner_id, order_date from stock_orders order by created_at desc, id',
        ),
      ])
      if (ticket !== openTicket.current || sqlite.companyId !== nextId) return
      const groups = groupContracts(nextRows, stamp)
      setRows(nextRows)
      setPartners(partnerRows)
      setOrders(
        orderRows.map((row) => ({
          id: row.id,
          partnerId: row.partner_id ?? undefined,
          orderDate: row.order_date ?? undefined,
        })),
      )
      setSelectedId((prev) => {
        const existing = nextRows.find((row) => row.id === prev)
        if (existing) {
          setLifeTab(contractPhase(existing.endAt, stamp))
          return existing.id
        }
        const tab = defaultContractTab(groups)
        setLifeTab(tab)
        return groups.find((section) => section.phase === tab)?.contracts[0]?.id ?? ''
      })
    } catch (error) {
      if (ticket !== openTicket.current) return
      setReady(false)
      setMessage(publicErrorMessage(error))
    } finally {
      if (ticket === openTicket.current) opening.current = false
    }
  }

  function resetForm() {
    setForm(emptyForm(today))
    setFile(null)
    setFileKey((key) => key + 1)
    setOcrReviewed(false)
    setOcrText('')
    setOcrFields([])
    setOcrMessage('')
  }

  useEffect(() => {
    if (!ready || !selectedId) {
      setRevisions([])
      return
    }
    let cancelled = false
    void loadContractRevisions(sqlite, selectedId).then((next) => {
      if (!cancelled) setRevisions(next)
    }).catch(() => {
      if (!cancelled) setRevisions([])
    })
    return () => {
      cancelled = true
    }
  }, [ready, selectedId, sqlite])

  async function pickFile(next: File | null) {
    setMessage('')
    setNotice('')
    setOcrText('')
    setOcrFields([])
    setOcrReviewed(false)
    if (!next) {
      setFile(null)
      ocrRun.current += 1
      setOcrBusy(false)
      return
    }
    const maxBytes = contractFileLimitBytes(limits.maxMb)
    let bytes: Uint8Array
    try {
      assertContractFile(next.size, next.type, next.name, undefined, maxBytes)
      bytes = new Uint8Array(await next.arrayBuffer())
      assertContractFile(bytes.byteLength, next.type, next.name, bytes, maxBytes)
      const hash = await hashFileBytes(bytes)
      if (rows.some((row) => row.fileHash === hash)) {
        throw new Error('같은 원본 파일은 계약을 한 번만 만듭니다.')
      }
    } catch (error) {
      setFile(null)
      setFileKey((key) => key + 1)
      setMessage(publicErrorMessage(error))
      setOcrMessage('')
      ocrPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    const run = ++ocrRun.current
    setFile(next)
    setOcrBusy(true)
    setOcrMessage('원본에서 글자를 읽는 중입니다. 처음이면 1분 정도 걸릴 수 있습니다.')
    ocrPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    try {
      const { extractLocalContract } = await import('../lib/contracts/localOcr')
      const result = await extractLocalContract({
        bytes,
        fileName: next.name,
        fileMime: next.type,
        maxPages: limits.maxPages,
        onProgress: (message) => {
          if (run === ocrRun.current) setOcrMessage(message)
        },
      })
      if (run !== ocrRun.current) return
      setForm((prev) => {
        const filled = applyOcrCandidates(prev, result.candidates)
        return {
          ...filled,
          partnerId: matchPartnerId(partners, filled.counterparty) ?? filled.partnerId ?? '',
          orderId: filled.orderId ?? prev.orderId,
        }
      })
      setOcrText(result.text ?? '')
      setOcrFields(result.candidates)
      setOcrReviewed(false)
      setOcrMessage(result.message)
    } catch (error) {
      if (run !== ocrRun.current) return
      setOcrReviewed(false)
      setOcrMessage(
        describeOcrResult({
          error: error instanceof Error ? error.message : String(error),
          text: '',
          candidateCount: 0,
        }),
      )
      ocrPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } finally {
      if (run === ocrRun.current) setOcrBusy(false)
    }
  }

  function stopOcr() {
    ocrRun.current += 1
    setOcrBusy(false)
    setOcrReviewed(false)
    setOcrMessage('읽기를 멈췄습니다. 다시 읽거나 직접 입력하세요. 원본은 그대로 둡니다.')
  }

  async function saveDraft(similarChoice?: SimilarChoice) {
    if (!ready || !canWriteOpenedCompany(guest, companyId, sqlite.companyId)) return
    setMessage('')
    setNotice('')
    const similar = similarDrafts(rows, form)
    if (similar.length && !similarChoice) {
      setMessage(similarChoiceLead(similar.length))
      return
    }
    if (file && !ocrReviewed) {
      setMessage('원본과 칸을 확인한 뒤에만 초안을 저장하세요.')
      return
    }
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
        partnerId: form.partnerId || matchPartnerId(partners, form.counterparty),
        orderId: form.orderId || undefined,
        fileName,
        fileHash,
        fileMime,
        fileBytes,
        ocrReviewed: Boolean(fileBytes) && ocrReviewed,
        ocrText: fileBytes ? ocrText : undefined,
        ocrFields: fileBytes ? reviewedOcrFields(ocrFields, form) : undefined,
        maxFileBytes: contractFileLimitBytes(limits.maxMb),
        similarChoice,
        reviseId: similar[0]?.id,
      })
      setNotice(draftSavedNotice({ duplicate: result.status === 'duplicate', revised: result.revised, hasFile: Boolean(fileBytes) }))
      const nextRows = await loadContracts(sqlite)
      setRows(nextRows)
      setLifeTab(contractPhase(form.endAt || undefined, today))
      setSelectedId(result.id)
      setRevisions(result.revised ? await loadContractRevisions(sqlite, result.id) : [])
      resetForm()
    } catch (error) {
      setMessage(publicErrorMessage(error))
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const similar = similarDrafts(rows, form)
    if (similar.length) {
      setMessage(similarChoiceLead(similar.length))
      return
    }
    await saveDraft()
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
      setMessage(publicErrorMessage(error))
    }
  }

  const groups = useMemo(() => groupContracts(rows, today), [rows, today])
  const visible = useMemo(
    () => filterContracts(groups.find((section) => section.phase === lifeTab)?.contracts ?? [], query),
    [groups, lifeTab, query],
  )
  const selected = rows.find((row) => row.id === selectedId)
  const dueLead = contractDueNotice(groups.find((section) => section.phase === 'due')?.contracts.length ?? 0)
  const similar = similarDrafts(rows, form)
  const similarHint = similarChoiceLead(similar.length)
  const ocrJob = ocrJobCaption(
    ocrJobStatus({
      busy: ocrBusy,
      failed: ocrFailedMessage(ocrMessage),
      candidateCount: ocrFields.length,
      reviewed: ocrReviewed,
      waitingConfirm: Boolean(file && ocrMessage && !ocrBusy && !ocrReviewed),
    }),
  )
  const saveBlocked = !ready || ocrBusy || Boolean(file && !ocrReviewed)
  const orderChoices = orders.map((row) => ({
    id: row.id,
    partnerName: partners.find((partner) => partner.id === row.partnerId)?.name,
    orderDate: row.orderDate,
  }))

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
        loginHint="계약은 로그인 후 지정 PC에서 다룹니다."
      />
    )
  }
  if (!guest && menuOff) {
    return (
      <ModuleClosed
        title="계약"
        keep="저장된 계약은 지우지 않았습니다."
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
          <h1 className="text-2xl font-semibold">계약</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            원본 PDF·PNG·JPEG를 올리면 이 PC에서 글자를 읽어 칸을 채웁니다. 확인하고 고친 뒤 초안만 저장합니다.
            같은 파일은 한 번만 받습니다. OCR만으로 체결하지 않습니다.
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
          <Link className="rounded border border-line px-3 py-2 text-sm" to={href('/master')}>
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
      {dueLead ? <p className="text-sm text-accent">{dueLead}</p> : null}
      {notice ? <p className="text-sm text-ok">{notice}</p> : null}
      {message ? <p className="text-sm text-danger">{message}</p> : null}

      <div
        className={
          selected || showsEmptyPickHint(rows.length)
            ? 'grid min-h-0 gap-4 xl:grid-cols-[16rem_minmax(0,1fr)_minmax(22rem,1fr)] xl:items-start'
            : 'grid min-h-0 gap-4 xl:grid-cols-[16rem_minmax(22rem,1fr)] xl:items-start'
        }
      >
        <nav className="flex max-h-[calc(100svh-10rem)] min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-card">
          <div className="grid shrink-0 grid-cols-3 border-b border-line">
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
                  {countLabel(section.contracts.length) ? (
                    <span className="mt-0.5 block font-medium">{section.contracts.length}</span>
                  ) : null}
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
                  {contractPeriod(row)} · {contractAmountText(row.amount, grouping, currency)}
                  {row.hasOriginal ? ` · ${row.fileName}` : ' · 원본 없음'}
                  {row.ocrStatus === 'reviewed' ? ' · OCR 확인' : ''}
                </span>
              </button>
            ))
          ) : (
            <p className="p-3 text-sm text-muted">
              {ready ? emptyContractTabCopy(lifeTab, query) : '회사 DB를 여는 중입니다.'}
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
                  <dt className="text-muted">거래처</dt>
                  <dd>
                    {selected.partnerName ? (
                      <Link className="text-accent underline" to={href('/master')}>
                        {selected.partnerName}
                      </Link>
                    ) : (
                      '없음'
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">연결 발주</dt>
                  <dd>
                    {selected.orderId ? (
                      <Link className="text-accent underline" to={href('/stock')}>
                        {selected.orderId}
                      </Link>
                    ) : (
                      '없음'
                    )}
                  </dd>
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
                    {contractPeriod(selected)} · {contractPhaseCaption(contractPhase(selected.endAt, today))}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">금액</dt>
                  <dd>{contractAmountText(selected.amount, grouping, currency)}</dd>
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
              {revisions.length ? (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold">{countHeading('개정 이력', revisions.length)}</h3>
                  <ol className="mt-2 grid gap-1 text-xs text-muted">
                    {revisions.map((row) => (
                      <li key={row.id}>{revisionCaption(row, grouping)}</li>
                    ))}
                  </ol>
                </div>
              ) : null}
              {selected.ocrFields?.length ? (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold">{countHeading('인식 근거', selected.ocrFields.length)}</h3>
                  <ul className="mt-2 grid gap-1 text-xs text-muted">
                    {selected.ocrFields.map((row) => (
                      <li key={row.field}>{ocrEvidenceLine(row)}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {selected.ocrText ? (
                <label className="mt-4 block text-sm">
                  읽은 글자
                  <textarea
                    readOnly
                    rows={4}
                    className="mt-1 w-full rounded border border-line px-3 py-2 font-mono text-xs"
                    value={selected.ocrText}
                  />
                </label>
              ) : null}
            </section>
          ) : showsEmptyPickHint(rows.length) ? (
            <section className="rounded-lg border border-dashed border-line bg-card p-4 text-sm text-muted">
              왼쪽에서 초안을 고르거나 오른쪽 칸으로 새 초안을 만드세요.
            </section>
          ) : null}

          <form className="grid max-h-[calc(100svh-10rem)] gap-3 overflow-auto rounded-lg border border-line bg-card p-4 sm:grid-cols-2" onSubmit={onSubmit}>
            <h2 className="text-lg font-semibold sm:col-span-2">새 초안</h2>
            {similarHint ? <p className="text-sm text-muted sm:col-span-2">{similarHint}</p> : null}
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
                onChange={(e) => {
                  const counterparty = e.target.value
                  setForm((prev) => ({
                    ...prev,
                    counterparty,
                    partnerId: matchPartnerId(partners, counterparty) ?? '',
                  }))
                }}
              />
            </label>
            {partners.length ? (
              <label className="text-sm">
                거래처
                <select
                  className="mt-1 w-full rounded border border-line px-3 py-2"
                  value={form.partnerId}
                  onChange={(e) => {
                    const partnerId = e.target.value
                    const name = partners.find((row) => row.id === partnerId)?.name
                    setForm((prev) => ({
                      ...prev,
                      partnerId,
                      counterparty: name || prev.counterparty,
                    }))
                  }}
                >
                  <option value="">직접 입력</option>
                  {partners.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {orderChoices.length ? (
              <label className="text-sm">
                연결 발주
                <select
                  className="mt-1 w-full rounded border border-line px-3 py-2"
                  value={form.orderId}
                  onChange={(e) => setForm((prev) => ({ ...prev, orderId: e.target.value }))}
                >
                  <option value="">없음</option>
                  {orderChoices.map((row) => (
                    <option key={row.id} value={row.id}>
                      {contractOrderLabel(row)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
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
              금액({displayCurrencyName(currency)})
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
              {file && !ocrBusy ? (
                <button
                  type="button"
                  className="rounded border border-line px-4 py-2 text-sm font-semibold"
                  onClick={() => void pickFile(file)}
                >
                  {ocrRetryLabel()}
                </button>
              ) : null}
              {ocrBusy ? (
                <button
                  type="button"
                  className="rounded border border-line px-4 py-2 text-sm font-semibold"
                  onClick={stopOcr}
                >
                  {ocrCancelLabel()}
                </button>
              ) : null}
              <span className="text-sm text-muted">
                {file ? file.name : `선택된 파일 없음 · ${contractLimitCaption(limits)}`}
              </span>
            </div>
            <div ref={ocrPanel} className="space-y-2 sm:col-span-2">
              {message ? <p className="text-sm text-danger">{message}</p> : null}
              {ocrJob ? <p className="text-sm text-muted">{ocrJob}</p> : null}
              {ocrBusy ? (
                <p className="text-sm text-muted">
                  {ocrMessage || '원본을 읽는 중입니다. 처음이면 1분 정도 걸릴 수 있습니다.'} 초안 저장은 글자를 읽은 뒤에 하세요.
                </p>
              ) : ocrMessage ? (
                <p className="text-sm text-accent">{ocrMessage}</p>
              ) : null}
              {ocrFields.length ? (
                <div>
                  <h3 className="text-sm font-semibold">{countHeading('인식 근거', ocrFields.length)}</h3>
                  <ul className="mt-1 grid gap-1 text-xs text-muted">
                    {ocrFields.map((row) => (
                      <li key={row.field}>
                        {ocrEvidenceLine({
                          ...row,
                          reviewedValue: formValueForOcrField(form, row.field),
                        })}
                      </li>
                    ))}
                  </ul>
                </div>
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
              {file && !ocrBusy ? (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={ocrReviewed}
                    onChange={(e) => setOcrReviewed(e.target.checked)}
                  />
                  <span>
                    {ocrConfirmLabel()}
                    <span className="mt-0.5 block text-xs text-muted">{ocrConfirmHint()}</span>
                  </span>
                </label>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              {similar.length ? (
                <>
                  <button
                    type="button"
                    disabled={saveBlocked}
                    className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    onClick={() => void saveDraft('new')}
                  >
                    새 초안으로 저장
                  </button>
                  <button
                    type="button"
                    disabled={saveBlocked}
                    className="rounded border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50"
                    onClick={() => void saveDraft('revise')}
                  >
                    기존을 개정
                  </button>
                </>
              ) : (
                <button type="submit" disabled={saveBlocked} className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  초안 저장
                </button>
              )}
            </div>
          </form>
      </div>
    </div>
  )
}
