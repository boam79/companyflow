import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { executeDraftContract, hashFileBytes, loadContractOriginal, loadContracts, type ContractDraft } from '../lib/contracts/book'
import { DISABLED_OCR } from '../lib/contracts/ocr'
import { writeDefaultMaster } from '../lib/master/book'
import { getCompanySqlite } from '../lib/sqlite/instance'
import { getSupabase, type CompanyRow } from '../lib/supabase'

const sqlite = getCompanySqlite()

function todayStamp() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
}

export function ContractsPage() {
  const { configured, loading, user } = useAuth()
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [companyId, setCompanyId] = useState('')
  const [rows, setRows] = useState<ContractDraft[]>([])
  const [title, setTitle] = useState('본사 임대')
  const [contractNo, setContractNo] = useState('')
  const [counterparty, setCounterparty] = useState('한국임대')
  const [signedAt, setSignedAt] = useState(todayStamp())
  const [startAt, setStartAt] = useState(todayStamp())
  const [endAt, setEndAt] = useState('')
  const [amount, setAmount] = useState('')
  const [ownerName, setOwnerName] = useState('김담당')
  const [file, setFile] = useState<File | null>(null)
  const [fileKey, setFileKey] = useState(0)
  const [selectedId, setSelectedId] = useState('')
  const [ocrMessage, setOcrMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [message, setMessage] = useState('')
  const [ready, setReady] = useState(false)
  const opening = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)

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
      setRows(await loadContracts(sqlite))
      const ocr = await DISABLED_OCR.extract({})
      setOcrMessage(ocr.message)
    } catch (error) {
      setReady(false)
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      opening.current = false
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
      const result = await executeDraftContract(sqlite, {
        operationId: crypto.randomUUID(),
        id: crypto.randomUUID(),
        title,
        contractNo,
        counterparty,
        signedAt,
        startAt,
        endAt: endAt || undefined,
        amount: amount ? Number(amount) : undefined,
        ownerName,
        fileName,
        fileHash,
        fileMime,
        fileBytes,
      })
      setNotice(
        result.status === 'duplicate'
          ? '같은 초안은 한 번만 반영됩니다.'
          : fileBytes
            ? '계약 초안과 원본 파일을 저장했습니다. OCR로 체결하지 않았습니다.'
            : '계약 초안을 저장했습니다. OCR로 체결하지 않았습니다.',
      )
      setRows(await loadContracts(sqlite))
      setFile(null)
      setFileKey((key) => key + 1)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function downloadOriginal(id: string) {
    setMessage('')
    try {
      const original = await loadContractOriginal(sqlite, id)
      const url = URL.createObjectURL(new Blob([original.bytes.buffer], { type: original.fileMime }))
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">계약</h1>
        <p className="mt-2 text-sm text-muted">
          직접 입력으로 초안만 만듭니다. 원본은 PDF·PNG·JPEG 8MB까지 이 PC에 남기고, 같은 파일은 한 번만
          받습니다. OCR은 꺼져 있습니다.
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
        <Link className="rounded border border-line px-3 py-2 text-sm" to="/master">
          거래처
        </Link>
        <Link className="rounded border border-line px-3 py-2 text-sm" to="/reports">
          통계
        </Link>
      </div>
      {ocrMessage ? <p className="text-sm text-accent">{ocrMessage}</p> : null}
      {notice ? <p className="text-sm text-ok">{notice}</p> : null}
      {message ? <p className="text-sm text-danger">{message}</p> : null}
      <form className="grid max-w-3xl gap-3 rounded-lg border border-line bg-card p-5 sm:grid-cols-2" onSubmit={onSubmit}>
        <label className="text-sm">
          계약명
          <input className="mt-1 w-full rounded border border-line px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="text-sm">
          계약번호
          <input className="mt-1 w-full rounded border border-line px-3 py-2" value={contractNo} onChange={(e) => setContractNo(e.target.value)} />
        </label>
        <label className="text-sm">
          상대방
          <input className="mt-1 w-full rounded border border-line px-3 py-2" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
        </label>
        <label className="text-sm">
          담당자
          <input className="mt-1 w-full rounded border border-line px-3 py-2" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
        </label>
        <label className="text-sm">
          체결일
          <input type="date" className="mt-1 w-full rounded border border-line px-3 py-2" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} />
        </label>
        <label className="text-sm">
          시작일
          <input type="date" className="mt-1 w-full rounded border border-line px-3 py-2" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
        </label>
        <label className="text-sm">
          종료일
          <input type="date" className="mt-1 w-full rounded border border-line px-3 py-2" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
        </label>
        <label className="text-sm">
          금액(원)
          <input type="number" min="0" className="mt-1 w-full rounded border border-line px-3 py-2" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <input
            key={fileKey}
            ref={fileInput}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
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
        <div className="sm:col-span-2">
          <button type="submit" disabled={!ready} className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            초안 저장
          </button>
        </div>
      </form>
      <section className="rounded-lg border border-line bg-card p-5">
        <h2 className="text-lg font-semibold">초안 {rows.length}</h2>
        {rows.length ? (
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="py-2 pr-3 font-medium">계약</th>
                <th className="py-2 pr-3 font-medium">상대방</th>
                <th className="py-2 pr-3 font-medium">원본</th>
                <th className="py-2 font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={`cursor-pointer border-b border-line/70 ${selectedId === row.id ? 'bg-accent-soft' : ''}`}
                  onClick={() => setSelectedId(row.id)}
                >
                  <td className="py-2 pr-3">{row.title}</td>
                  <td className="py-2 pr-3">{row.counterparty}</td>
                  <td className="py-2 pr-3">{row.hasOriginal ? row.fileName : '없음'}</td>
                  <td className="py-2">초안 · OCR 꺼짐</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-sm text-muted">{ready ? '저장된 초안이 없습니다.' : '회사 DB를 여는 중입니다.'}</p>
        )}
        {selected ? (
          <div className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
            <p>
              {selected.title} · {selected.counterparty}
              {selected.ownerName ? ` · ${selected.ownerName}` : ''}
            </p>
            <p className="text-muted">
              {[selected.startAt, selected.endAt].filter(Boolean).join(' ~ ') || '기간 없음'}
              {selected.amount != null ? ` · ${selected.amount.toLocaleString('ko-KR')}원` : ''}
            </p>
            {selected.hasOriginal ? (
              <button
                type="button"
                className="rounded border border-line px-3 py-1 text-xs font-semibold"
                onClick={() => void downloadOriginal(selected.id)}
              >
                원본 받기
              </button>
            ) : (
              <p className="text-muted">이 초안에는 원본 파일이 없습니다.</p>
            )}
          </div>
        ) : null}
      </section>
    </div>
  )
}
