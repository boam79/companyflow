import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { writeDefaultMaster } from '../lib/master/book'
import { toArrayBuffer } from '../lib/contracts/book'
import {
  applyBadgeLines,
  executeSaveBadgeTemplate,
  inspectBadgeTemplate,
  loadBadgeTemplate,
  loadBadgeTemplateOriginal,
  type BadgeTemplateRecord,
} from '../lib/people/badgeTemplate'
import { badgeFillValues, isBadgeFilled, matchTemplateSpacing, type BadgeFillValues } from '../lib/people/badgeFill'
import type { BadgePreviewPage } from '../lib/people/badgePreview'
import {
  badgeNotifyMessage,
  executeSaveNotifySettings,
  loadNotifySettings,
  sendSlackWebhook,
  type NotifySettings,
} from '../lib/people/badgeNotify'
import {
  executeHire,
  executeLeave,
  employeeHireDraft,
  loadEmployees,
  type EmployeeRecord,
} from '../lib/people/employment'
import {
  executeOnboardingToggle,
  leavePhase,
  leaveSummary,
  loadOnboardingChecks,
  migrateProcessAssetsToChecks,
  onboardingView,
  outstandingOnboarding,
  type CheckRow,
  type OnboardingCheck,
  type OnboardingKey,
} from '../lib/people/onboarding'
import { retireSupplyAssets } from '../lib/asset/retireSupplies'
import { getCompanySqlite } from '../lib/sqlite/instance'
import { getSupabase, type CompanyRow } from '../lib/supabase'

type NamedRow = { id: string; name: string }

const sqlite = getCompanySqlite()

function todayStamp() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (ch) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return map[ch] ?? ch
  })
}

function printBadge(lines: string[]) {
  const win = window.open('', '_blank', 'width=420,height=320')
  if (!win) return
  win.document.write(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>명찰</title>
<style>
  body { font-family: sans-serif; padding: 24px; }
  .badge { border: 2px solid #111; width: 240px; padding: 28px 16px; text-align: center; }
  p { margin: 8px 0; }
</style></head><body>
<div class="badge">${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}</div>
<script>window.onload = function () { window.print() }<\/script>
</body></html>`)
  win.document.close()
}

export function PeoplePage() {
  const { configured, loading, user } = useAuth()
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [companyId, setCompanyId] = useState('')
  const [departments, setDepartments] = useState<NamedRow[]>([])
  const [employees, setEmployees] = useState<EmployeeRecord[]>([])
  const [checks, setChecks] = useState<CheckRow[]>([])
  const [drafts, setDrafts] = useState<
    Record<string, { hiredAt: string; title: string; badgeName: string; department: string }>
  >({})
  const [notice, setNotice] = useState('')
  const [message, setMessage] = useState('')
  const [ready, setReady] = useState(false)
  const [badgeTemplate, setBadgeTemplate] = useState<BadgeTemplateRecord | undefined>()
  const [badgeFile, setBadgeFile] = useState<File | null>(null)
  const [badgePreview, setBadgePreview] = useState('')
  const [badgePreviewImages, setBadgePreviewImages] = useState<BadgePreviewPage[]>([])
  const [previewStatus, setPreviewStatus] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle')
  const [badgeEmployeeId, setBadgeEmployeeId] = useState('')
  const [notify, setNotify] = useState<NotifySettings>({ adminEmail: '', slackWebhook: '' })
  const opening = useRef(false)
  const badgeInput = useRef<HTMLInputElement>(null)
  const previewSeq = useRef(0)

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
      const [deptRows, employeeRows, checkRows, template, notifyRow] = await Promise.all([
        sqlite.query<NamedRow>('select id, name from departments order by name'),
        loadEmployees(sqlite),
        loadOnboardingChecks(sqlite),
        loadBadgeTemplate(sqlite),
        loadNotifySettings(sqlite),
      ])
      setDepartments(deptRows)
      setEmployees(employeeRows)
      setChecks(checkRows)
      setBadgeTemplate(template)
      setNotify(notifyRow)
      setBadgeEmployeeId((prev) => prev || employeeRows.find((row) => !row.leftAt)?.id || employeeRows[0]?.id || '')
      if (template) {
        const original = await loadBadgeTemplateOriginal(sqlite)
        await showBadgePreview(original.bytes)
      } else {
        setBadgePreviewImages([])
        setPreviewStatus('idle')
      }
      setDrafts(
        Object.fromEntries(employeeRows.map((row) => [row.id, employeeHireDraft(row, deptRows, todayStamp())])),
      )
    } catch (error) {
      setReady(false)
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      opening.current = false
    }
  }

  async function showBadgePreview(bytes: Uint8Array) {
    const seq = (previewSeq.current += 1)
    setPreviewStatus('loading')
    const { renderBadgeTemplatePreview } = await import('../lib/people/badgePreview')
    const pages = await renderBadgeTemplatePreview(bytes)
    if (seq !== previewSeq.current) return
    setBadgePreviewImages(pages)
    setPreviewStatus(pages.length ? 'ready' : 'unavailable')
  }

  function currentFillValues(): BadgeFillValues {
    const employee = employees.find((row) => row.id === badgeEmployeeId)
    if (!employee) return {}
    const draft = drafts[employee.id]
    return badgeFillValues(
      { name: employee.name, badgeName: draft?.badgeName || employee.badgeName, title: draft?.title || employee.title },
      draft?.department || employee.badgeDepartment,
    )
  }

  async function saveNotify() {
    setMessage('')
    setNotice('')
    try {
      const saved = await executeSaveNotifySettings(sqlite, notify)
      setNotify(saved)
      setNotice('슬랙 보낼 곳을 저장했습니다.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function sendFilledBadgeSlack() {
    setMessage('')
    setNotice('')
    const values = currentFillValues()
    if (!isBadgeFilled(values)) {
      setMessage('입사 칸에 명찰 이름과 직위 또는 부서를 먼저 넣으세요.')
      return
    }
    const text = badgeNotifyMessage(values)
    try {
      await sendSlackWebhook(notify.slackWebhook, text)
      setNotice('슬랙으로 채워진 명찰 정보를 보냈습니다.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function downloadFilledBadgePdf() {
    setMessage('')
    setNotice('')
    const values = currentFillValues()
    if (!isBadgeFilled(values)) {
      setMessage('입사 칸에 명찰 이름과 직위 또는 부서를 먼저 넣으세요.')
      return
    }
    try {
      const original = await loadBadgeTemplateOriginal(sqlite)
      const { buildFilledBadgePdf, ptsToMm } = await import('../lib/people/badgePdf')
      const file = await buildFilledBadgePdf(original.bytes, values)
      const url = URL.createObjectURL(new Blob([toArrayBuffer(file.pdf)], { type: 'application/pdf' }))
      const link = document.createElement('a')
      link.href = url
      link.download = file.fileName
      link.click()
      URL.revokeObjectURL(url)
      setNotice(
        `${file.fileName}을 받았습니다. ${ptsToMm(file.widthPt).toFixed(1)}×${ptsToMm(file.heightPt).toFixed(1)}mm · 인쇄는 배율 100%(실제 크기)로 한 뒤 잘라 붙이세요.`,
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function refreshPeople() {
    const [employeeRows, checkRows, template] = await Promise.all([
      loadEmployees(sqlite),
      loadOnboardingChecks(sqlite),
      loadBadgeTemplate(sqlite),
    ])
    setEmployees(employeeRows)
    setChecks(checkRows)
    setBadgeTemplate(template)
  }

  function printEmployeeBadge(employee: EmployeeRecord, departmentName?: string) {
    printBadge(applyBadgeLines({ ...employee, name: employee.name }, departmentName, badgeTemplate?.fields ?? []))
  }

  async function saveBadgeTemplate() {
    if (!badgeFile) {
      setMessage('명찰 템플릿 PDF 또는 AI 파일을 선택하세요.')
      return
    }
    setMessage('')
    setNotice('')
    try {
      const fileBytes = new Uint8Array(await badgeFile.arrayBuffer())
      const inspected = await inspectBadgeTemplate(fileBytes, badgeFile.name)
      setBadgePreview(inspected.extractedText)
      const result = await executeSaveBadgeTemplate(sqlite, {
        operationId: crypto.randomUUID(),
        fileName: badgeFile.name,
        fileMime: badgeFile.type,
        fileBytes,
      })
      setBadgeTemplate(result.template)
      await showBadgePreview(fileBytes)
      setBadgeFile(null)
      if (badgeInput.current) badgeInput.current.value = ''
      const fieldLabels = result.template.fields.map((field) => field.label).join(' · ')
      setNotice(
        result.status === 'duplicate'
          ? '같은 명찰 템플릿은 이미 올려 두었습니다.'
          : fieldLabels
            ? `명찰 템플릿을 올렸습니다. 파악한 칸: ${fieldLabels}`
            : result.template.sourceKind === 'ai-binary'
              ? 'Illustrator 원본은 보존했습니다. 칸을 읽으려면 PDF로 저장해 올리세요.'
              : '명찰 템플릿 원본은 보존했습니다. 이름·부서·직위 칸 글자를 찾지 못했습니다.',
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function downloadBadgeTemplate() {
    setMessage('')
    try {
      const original = await loadBadgeTemplateOriginal(sqlite)
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

  async function hire(employeeId: string) {
    const draft = drafts[employeeId]
    if (!draft) return
    setMessage('')
    setNotice('')
    try {
      const wasLeft = Boolean(employees.find((row) => row.id === employeeId)?.leftAt)
      const result = await executeHire(sqlite, {
        operationId: crypto.randomUUID(),
        employeeId,
        hiredAt: draft.hiredAt,
        title: draft.title,
        badgeName: draft.badgeName,
        department: draft.department,
      })
      setNotice(
        result.status === 'duplicate'
          ? '같은 입사는 한 번만 반영됩니다.'
          : wasLeft
            ? '재입사했습니다. 입사 프로세스를 이어갈 수 있습니다.'
            : '입사를 기록했습니다.',
      )
      setBadgeEmployeeId(employeeId)
      await refreshPeople()
      const values = badgeFillValues(
        { name: employees.find((row) => row.id === employeeId)?.name || draft.badgeName, badgeName: draft.badgeName, title: draft.title },
        draft.department,
      )
      if (result.status === 'applied' && isBadgeFilled(values)) {
        const text = badgeNotifyMessage(values)
        if (notify.slackWebhook) {
          await sendSlackWebhook(notify.slackWebhook, text)
          setNotice((prev) => `${prev} 슬랙으로 명찰 정보를 보냈습니다.`)
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function toggleCheck(employeeId: string, row: OnboardingCheck, issued: boolean) {
    setMessage('')
    setNotice('')
    try {
      const result = await executeOnboardingToggle(sqlite, {
        operationId: crypto.randomUUID(),
        employeeId,
        itemKey: row.key as OnboardingKey,
        issued,
      })
      setNotice(
        result.status === 'duplicate'
          ? '같은 처리는 한 번만 반영됩니다.'
          : issued
            ? `입사 프로세스: ${row.hireLabel} 완료`
            : `퇴사 프로세스: ${row.leaveLabel} 완료`,
      )
      await refreshPeople()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function leave(employeeId: string) {
    setMessage('')
    setNotice('')
    try {
      const result = await executeLeave(sqlite, {
        operationId: crypto.randomUUID(),
        employeeId,
        leftAt: todayStamp(),
      })
      setNotice(result.status === 'duplicate' ? '같은 퇴사는 한 번만 반영됩니다.' : '퇴사를 기록했습니다.')
      setDrafts((prev) => {
        const current = prev[employeeId]
        if (!current) return prev
        return { ...prev, [employeeId]: { ...current, hiredAt: todayStamp() } }
      })
      await refreshPeople()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const selectedEmployee = employees.find((row) => row.id === badgeEmployeeId) ?? employees[0]
  const selectedDraft = selectedEmployee
    ? drafts[selectedEmployee.id] ?? employeeHireDraft(selectedEmployee, departments, todayStamp())
    : null
  const selectedProcess = selectedEmployee ? onboardingView(selectedEmployee.id, checks) : []
  const selectedHeld = selectedEmployee ? outstandingOnboarding(selectedProcess).length : 0

  if (loading) return <p className="text-sm text-muted">세션을 확인하는 중입니다.</p>
  if (!configured) return <p className="text-sm text-muted">중앙 운영이 연결되지 않았습니다.</p>
  if (!user) {
    return (
      <p className="text-sm">
        입퇴사는 로그인 후 지정 PC에서 다룹니다.{' '}
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
          <h1 className="text-2xl font-semibold">직원·입퇴사</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            명찰·유니폼·노트북은 입사·퇴사 프로세스입니다. 가구·컴퓨터는 자산 메뉴에서 QR로 등록하며, 직원에게 배정하지 않습니다.
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
            기준정보
          </Link>
          <Link className="rounded border border-line px-3 py-2 text-sm" to="/assets">
            회사 자산
          </Link>
        </div>
      </div>
      {notice ? <p className="text-sm text-ok">{notice}</p> : null}
      {message ? <p className="text-sm text-danger">{message}</p> : null}
      <section className="grid min-h-0 gap-4 xl:grid-cols-[13rem_minmax(0,1fr)_18rem] xl:items-start">
        {employees.length ? (
          <>
            <nav className="max-h-[calc(100svh-9rem)] overflow-y-auto rounded-lg border border-line bg-card">
              <p className="sticky top-0 border-b border-line bg-card px-3 py-2 text-xs font-semibold text-muted">
                직원 {employees.length}
              </p>
              {employees.map((employee) => {
                const process = onboardingView(employee.id, checks)
                const held = outstandingOnboarding(process).length
                const active = employee.id === (employees.some((row) => row.id === badgeEmployeeId)
                  ? badgeEmployeeId
                  : employees[0].id)
                return (
                  <button
                    key={employee.id}
                    type="button"
                    className={`flex w-full flex-col items-start border-b border-line/70 px-3 py-2 text-left last:border-b-0 ${
                      active ? 'bg-accent-soft' : 'hover:bg-paper'
                    }`}
                    onClick={() => {
                      setMessage('')
                      setNotice('')
                      setBadgeEmployeeId(employee.id)
                    }}
                  >
                    <span className="font-medium whitespace-nowrap">{employee.name}</span>
                    <span className="mt-0.5 text-xs text-muted">
                      {employee.leftAt
                        ? `퇴사 ${employee.leftAt}`
                        : employee.hiredAt
                          ? `재직 · ${employee.hiredAt}`
                          : '입사 전'}
                      {held ? ` · 미회수 ${held}` : ''}
                    </span>
                  </button>
                )
              })}
            </nav>
            {selectedEmployee && selectedDraft ? (
              <article className="rounded-lg border border-line bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold whitespace-nowrap">{selectedEmployee.name}</h2>
                    <p className="mt-1 text-sm text-muted">
                      {selectedEmployee.leftAt
                        ? `퇴사 ${selectedEmployee.leftAt}`
                        : selectedEmployee.hiredAt
                          ? `재직 · 입사 ${selectedEmployee.hiredAt}`
                          : '입사 전'}
                      {selectedHeld ? ` · 지급품 미회수 ${selectedHeld}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedEmployee.leftAt ? (
                      <button
                        type="button"
                        disabled={!ready}
                        className="rounded bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        onClick={() => void hire(selectedEmployee.id)}
                      >
                        재입사
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!ready}
                        className="rounded bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        onClick={() => void hire(selectedEmployee.id)}
                      >
                        입사 저장
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!ready}
                      className="rounded border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                      onClick={() =>
                        printEmployeeBadge(
                          { ...selectedEmployee, ...selectedDraft, name: selectedEmployee.name },
                          selectedDraft.department,
                        )
                      }
                    >
                      명찰
                    </button>
                    {selectedEmployee.leftAt ? null : (
                      <button
                        type="button"
                        disabled={!ready}
                        className="rounded border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                        onClick={() => void leave(selectedEmployee.id)}
                      >
                        퇴사
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="block text-sm">
                    부서
                    <input
                      className="mt-1 w-full rounded border border-line px-2 py-1.5"
                      placeholder="부서"
                      value={selectedDraft.department}
                      onChange={(e) => {
                        setBadgeEmployeeId(selectedEmployee.id)
                        setDrafts((prev) => ({
                          ...prev,
                          [selectedEmployee.id]: { ...selectedDraft, department: e.target.value },
                        }))
                      }}
                    />
                  </label>
                  <label className="block text-sm">
                    입사일
                    <input
                      type="date"
                      className="mt-1 w-full rounded border border-line px-2 py-1.5"
                      value={selectedDraft.hiredAt}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [selectedEmployee.id]: { ...selectedDraft, hiredAt: e.target.value },
                        }))
                      }
                    />
                  </label>
                  <label className="block text-sm">
                    직위
                    <input
                      className="mt-1 w-full rounded border border-line px-2 py-1.5"
                      placeholder="직위"
                      value={selectedDraft.title}
                      onChange={(e) => {
                        setBadgeEmployeeId(selectedEmployee.id)
                        setDrafts((prev) => ({
                          ...prev,
                          [selectedEmployee.id]: { ...selectedDraft, title: e.target.value },
                        }))
                      }}
                    />
                  </label>
                  <label className="block text-sm">
                    명찰 이름
                    <input
                      className="mt-1 w-full rounded border border-line px-2 py-1.5"
                      placeholder="명찰 이름"
                      value={selectedDraft.badgeName}
                      onChange={(e) => {
                        setBadgeEmployeeId(selectedEmployee.id)
                        setDrafts((prev) => ({
                          ...prev,
                          [selectedEmployee.id]: { ...selectedDraft, badgeName: e.target.value },
                        }))
                      }}
                    />
                  </label>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-semibold">입사 프로세스</h3>
                    <ul className="mt-2 space-y-2">
                      {selectedProcess.map((row) => (
                        <li key={`hire-${row.key}`} className="flex items-center gap-2 whitespace-nowrap">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              className="size-4 shrink-0 accent-accent"
                              checked={row.issued}
                              disabled={!ready || Boolean(selectedEmployee.leftAt) || row.issued}
                              onChange={(e) => {
                                if (e.target.checked) void toggleCheck(selectedEmployee.id, row, true)
                              }}
                            />
                            <span className={row.issued ? 'font-medium' : 'text-muted'}>{row.hireLabel}</span>
                          </label>
                          {row.key === 'badge' ? (
                            <button
                              type="button"
                              disabled={!ready}
                              className="rounded border border-line px-2 py-0.5 text-xs disabled:opacity-50"
                              onClick={() =>
                                printEmployeeBadge(
                                  { ...selectedEmployee, ...selectedDraft, name: selectedEmployee.name },
                                  selectedDraft.department,
                                )
                              }
                            >
                              출력
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-muted">{selectedHeld}/3 지급</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">퇴사 프로세스</h3>
                    <ul className="mt-2 space-y-2">
                      {selectedProcess.map((row) => {
                        const phase = leavePhase(row, Boolean(selectedEmployee.leftAt))
                        return (
                          <li key={`leave-${row.key}`}>
                            <label className="flex items-center gap-2 whitespace-nowrap">
                              <input
                                type="checkbox"
                                className="size-4 shrink-0 accent-accent"
                                checked={phase === 'returned'}
                                disabled={!ready || Boolean(selectedEmployee.leftAt) || phase !== 'held'}
                                onChange={(e) => {
                                  if (e.target.checked) void toggleCheck(selectedEmployee.id, row, false)
                                }}
                              />
                              <span className={phase === 'held' ? 'font-medium' : 'text-muted'}>
                                {phase === 'pending' ? `${row.name} 지급 전` : row.leaveLabel}
                              </span>
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                    <p className="mt-2 text-xs text-muted">
                      {leaveSummary(selectedProcess, Boolean(selectedEmployee.leftAt))}
                    </p>
                  </div>
                </div>
              </article>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted xl:col-span-2">
            {ready ? '기준정보에서 직원을 먼저 등록하세요.' : '회사 DB를 여는 중입니다.'}
          </p>
        )}
        <aside className="max-h-[calc(100svh-9rem)] overflow-auto rounded-lg border border-line bg-card p-4">
          <h2 className="text-base font-semibold">명찰 템플릿</h2>
          <p className="mt-1 text-sm text-muted">
            PDF 또는 Illustrator(.ai) 원본을 올리면 이름·부서·직위 칸을 읽습니다. 브라우저에서 AI를 직접 고치지 않고 원본은 이 PC에 남깁니다.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              ref={badgeInput}
              type="file"
              accept=".ai,.pdf,application/pdf,application/postscript,application/illustrator"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null
                setBadgeFile(file)
                if (!file) return
                void file.arrayBuffer().then((buffer) => showBadgePreview(new Uint8Array(buffer)))
              }}
            />
            <button
              type="button"
              className="rounded border border-line px-3 py-1.5 text-sm font-semibold"
              onClick={() => badgeInput.current?.click()}
            >
              첨부파일
            </button>
            <button
              type="button"
              disabled={!ready}
              className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              onClick={() => void saveBadgeTemplate()}
            >
              템플릿 올리기
            </button>
            {badgeTemplate ? (
              <button
                type="button"
                disabled={!ready}
                className="rounded border border-line px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                onClick={() => void downloadBadgeTemplate()}
              >
                원본 받기
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-muted">
            {badgeFile ? badgeFile.name : '선택된 파일 없음 · PDF·AI 8MB'}
          </p>
          {badgeTemplate ? (
            <div className="mt-3 space-y-1 text-sm">
              <p>
                올린 파일: <span className="font-medium">{badgeTemplate.fileName}</span>
              </p>
              <p>
                파악한 칸:{' '}
                {badgeTemplate.fields.length
                  ? badgeTemplate.fields.map((field) => field.label).join(' · ')
                  : '이름·부서·직위 글자를 찾지 못했습니다'}
              </p>
              {badgePreview || badgeTemplate.extractedText ? (
                <p className="text-muted">읽은 글자: {badgePreview || badgeTemplate.extractedText}</p>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">아직 올린 명찰 템플릿이 없습니다.</p>
          )}
          {previewStatus === 'loading' ? (
            <p className="mt-3 text-sm text-muted">템플릿 미리보기를 그리는 중입니다.</p>
          ) : null}
          {previewStatus === 'ready' && badgePreviewImages.length ? (
            <div className="mt-3 w-fit max-w-full rounded border border-line bg-white p-2">
              <p className="mb-2 text-xs font-medium">미리보기 · 원본은 그대로 두고 입사 칸만 올립니다</p>
              <div className="flex flex-wrap items-start gap-3">
                {badgePreviewImages.map((page, index) => (
                  <div
                    key={`${index}-${page.image.slice(-24)}`}
                    className="relative w-[240px] max-w-full"
                    style={{ containerType: 'inline-size' }}
                  >
                    <img src={page.image} alt={`명찰 템플릿 원본 ${index + 1}`} className="h-auto w-full" />
                    {page.overlay.map((box) => {
                      const text = currentFillValues()[box.key]
                      if (!text) return null
                      return (
                        <div
                          key={box.key}
                          className="absolute overflow-hidden bg-white leading-none text-ink"
                          style={{
                            left: box.left,
                            top: box.top,
                            width: box.width,
                            height: box.height,
                            fontSize: box.fontSize,
                            fontFamily: box.fontFamily,
                            fontWeight: box.fontWeight,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: box.textAlign === 'left' ? 'flex-start' : 'center',
                            textAlign: box.textAlign,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {matchTemplateSpacing(text, box.sample)}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {previewStatus === 'ready' && badgePreviewImages.length ? (
            <div className="mt-3 space-y-2 text-sm">
              <p className="text-muted">
                지금 채우는 직원:{' '}
                <span className="font-medium">
                  {employees.find((row) => row.id === badgeEmployeeId)?.name ?? '직원을 고르세요'}
                </span>
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={!ready}
                  className="rounded bg-accent px-3 py-2 font-semibold text-white disabled:opacity-50"
                  onClick={() => void downloadFilledBadgePdf()}
                >
                  명찰 PDF 받기
                </button>
                <input
                  className="w-full rounded border border-line px-3 py-2"
                  placeholder="슬랙 Incoming Webhook"
                  value={notify.slackWebhook}
                  onChange={(e) => setNotify((prev) => ({ ...prev, slackWebhook: e.target.value }))}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!ready}
                    className="rounded border border-line px-3 py-1.5 font-semibold disabled:opacity-50"
                    onClick={() => void saveNotify()}
                  >
                    보낼 곳 저장
                  </button>
                  <button
                    type="button"
                    disabled={!ready}
                    className="rounded border border-line px-3 py-1.5 font-semibold disabled:opacity-50"
                    onClick={() => void sendFilledBadgeSlack()}
                  >
                    슬랙 보내기
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted">
                PDF는 템플릿 명찰 크기·나눔고딕 글자 크기 그대로입니다. 인쇄 배율 100%(실제 크기)로 출력한 뒤 잘라 붙이세요.
              </p>
            </div>
          ) : null}
          {previewStatus === 'unavailable' ? (
            <p className="mt-3 text-sm text-muted">
              {badgeTemplate?.sourceKind === 'ai-binary'
                ? '이 Illustrator 파일은 화면 미리보기를 할 수 없습니다. PDF로 저장해 올리면 보입니다.'
                : '이 파일은 화면 미리보기를 그리지 못했습니다. 원본은 보존되어 있습니다.'}
            </p>
          ) : null}
        </aside>
      </section>
    </div>
  )
}
