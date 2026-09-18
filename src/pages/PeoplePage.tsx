import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { toArrayBuffer } from '../lib/contracts/book'
import { writeDefaultMaster } from '../lib/master/book'
import {
  applyBadgeLines,
  executeSaveBadgeTemplate,
  inspectBadgeTemplate,
  loadBadgeTemplate,
  loadBadgeTemplateOriginal,
  type BadgeTemplateRecord,
} from '../lib/people/badgeTemplate'
import {
  executeHire,
  executeLeave,
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
  const [drafts, setDrafts] = useState<Record<string, { hiredAt: string; title: string; badgeName: string }>>(
    {},
  )
  const [notice, setNotice] = useState('')
  const [message, setMessage] = useState('')
  const [ready, setReady] = useState(false)
  const [badgeTemplate, setBadgeTemplate] = useState<BadgeTemplateRecord | undefined>()
  const [badgeFile, setBadgeFile] = useState<File | null>(null)
  const [badgePreview, setBadgePreview] = useState('')
  const opening = useRef(false)
  const badgeInput = useRef<HTMLInputElement>(null)

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
      const [deptRows, employeeRows, checkRows, template] = await Promise.all([
        sqlite.query<NamedRow>('select id, name from departments order by name'),
        loadEmployees(sqlite),
        loadOnboardingChecks(sqlite),
        loadBadgeTemplate(sqlite),
      ])
      setDepartments(deptRows)
      setEmployees(employeeRows)
      setChecks(checkRows)
      setBadgeTemplate(template)
      setDrafts(
        Object.fromEntries(
          employeeRows.map((row) => [
            row.id,
            {
              hiredAt: row.hiredAt || todayStamp(),
              title: row.title || '',
              badgeName: row.badgeName || row.name,
            },
          ]),
        ),
      )
    } catch (error) {
      setReady(false)
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      opening.current = false
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
      })
      setNotice(
        result.status === 'duplicate'
          ? '같은 입사는 한 번만 반영됩니다.'
          : wasLeft
            ? '재입사했습니다. 입사 프로세스를 이어갈 수 있습니다.'
            : '입사를 기록했습니다.',
      )
      await refreshPeople()
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
      await refreshPeople()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">직원·입퇴사</h1>
        <p className="mt-2 text-sm text-muted">
          명찰·유니폼·노트북은 자산이 아니라 입사·퇴사 프로세스입니다. 회사 재고·자산과 섞지 않습니다.
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
          기준정보
        </Link>
      </div>
      {notice ? <p className="text-sm text-ok">{notice}</p> : null}
      {message ? <p className="text-sm text-danger">{message}</p> : null}
      <section className="rounded-lg border border-line bg-card p-5">
        <h2 className="text-lg font-semibold">명찰 템플릿</h2>
        <p className="mt-1 text-sm text-muted">
          PDF 또는 Illustrator(.ai) 원본을 올리면 이름·부서·직위 칸을 읽습니다. 브라우저에서 AI를 직접 고치지 않고 원본은 이 PC에 남깁니다.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            ref={badgeInput}
            type="file"
            accept=".ai,.pdf,application/pdf,application/postscript,application/illustrator"
            className="sr-only"
            onChange={(e) => setBadgeFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            className="rounded border border-line px-4 py-2 text-sm font-semibold"
            onClick={() => badgeInput.current?.click()}
          >
            첨부파일
          </button>
          <span className="text-sm text-muted">
            {badgeFile ? badgeFile.name : '선택된 파일 없음 · PDF·AI 8MB'}
          </span>
          <button
            type="button"
            disabled={!ready}
            className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={() => void saveBadgeTemplate()}
          >
            템플릿 올리기
          </button>
          {badgeTemplate ? (
            <button
              type="button"
              disabled={!ready}
              className="rounded border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50"
              onClick={() => void downloadBadgeTemplate()}
            >
              원본 받기
            </button>
          ) : null}
        </div>
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
      </section>
      <section className="rounded-lg border border-line bg-card p-5">
        {employees.length ? (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="py-2 pr-3 font-medium">이름</th>
                <th className="py-2 pr-3 font-medium">부서</th>
                <th className="py-2 pr-3 font-medium">입사</th>
                <th className="py-2 pr-3 font-medium">입사 프로세스</th>
                <th className="py-2 pr-3 font-medium">퇴사 프로세스</th>
                <th className="py-2 font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => {
                const draft = drafts[employee.id] ?? {
                  hiredAt: todayStamp(),
                  title: '',
                  badgeName: employee.name,
                }
                const process = onboardingView(employee.id, checks)
                const held = outstandingOnboarding(process).length
                const deptName = departments.find((dept) => dept.id === employee.departmentId)?.name
                return (
                  <tr key={employee.id} className="border-b border-line/70 align-top">
                    <td className="py-3 pr-3">{employee.name}</td>
                    <td className="py-3 pr-3">{deptName ?? '-'}</td>
                    <td className="py-3 pr-3">
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="date"
                          className="rounded border border-line px-2 py-1"
                          value={draft.hiredAt}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [employee.id]: { ...draft, hiredAt: e.target.value },
                            }))
                          }
                        />
                        <input
                          className="w-24 rounded border border-line px-2 py-1"
                          placeholder="직위"
                          value={draft.title}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [employee.id]: { ...draft, title: e.target.value },
                            }))
                          }
                        />
                        <input
                          className="w-28 rounded border border-line px-2 py-1"
                          placeholder="명찰 이름"
                          value={draft.badgeName}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [employee.id]: { ...draft, badgeName: e.target.value },
                            }))
                          }
                        />
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      <ul className="space-y-1.5">
                        {process.map((row) => (
                          <li key={`hire-${row.key}`}>
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                className="size-4 accent-accent"
                                checked={row.issued}
                                disabled={!ready || Boolean(employee.leftAt) || row.issued}
                                onChange={(e) => {
                                  if (e.target.checked) void toggleCheck(employee.id, row, true)
                                }}
                              />
                              <span className={row.issued ? 'font-medium' : 'text-muted'}>{row.hireLabel}</span>
                              {row.key === 'badge' ? (
                                <button
                                  type="button"
                                  disabled={!ready}
                                  className="rounded border border-line px-2 py-0.5 text-xs disabled:opacity-50"
                                  onClick={() =>
                                    printEmployeeBadge({ ...employee, ...draft, name: employee.name }, deptName)
                                  }
                                >
                                  출력
                                </button>
                              ) : null}
                            </label>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1 text-xs text-muted">{held}/3 지급</p>
                    </td>
                    <td className="py-3 pr-3">
                      <ul className="space-y-1.5">
                        {process.map((row) => {
                          const phase = leavePhase(row, Boolean(employee.leftAt))
                          return (
                          <li key={`leave-${row.key}`}>
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                className="size-4 accent-accent"
                                checked={phase === 'returned'}
                                disabled={!ready || Boolean(employee.leftAt) || phase !== 'held'}
                                onChange={(e) => {
                                  if (e.target.checked) void toggleCheck(employee.id, row, false)
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
                      <p className="mt-1 text-xs text-muted">{leaveSummary(process, Boolean(employee.leftAt))}</p>
                    </td>
                    <td className="py-3">
                      <p className="text-muted">
                        {employee.leftAt
                          ? `퇴사 ${employee.leftAt}`
                          : employee.hiredAt
                            ? `재직 · 입사 ${employee.hiredAt}`
                            : '입사 전'}
                        {held ? ` · 미회수 ${held}` : ''}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {employee.leftAt ? (
                          <button
                            type="button"
                            disabled={!ready}
                            className="rounded bg-accent px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                            onClick={() => void hire(employee.id)}
                          >
                            재입사
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!ready}
                            className="rounded bg-accent px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                            onClick={() => void hire(employee.id)}
                          >
                            입사 저장
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={!ready}
                          className="rounded border border-line px-3 py-1 text-xs font-semibold disabled:opacity-50"
                          onClick={() =>
                            printEmployeeBadge({ ...employee, ...draft, name: employee.name }, deptName)
                          }
                        >
                          명찰
                        </button>
                        {employee.leftAt ? null : (
                          <button
                            type="button"
                            disabled={!ready}
                            className="rounded border border-line px-3 py-1 text-xs font-semibold disabled:opacity-50"
                            onClick={() => void leave(employee.id)}
                          >
                            퇴사
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted">
            {ready ? '기준정보에서 직원을 먼저 등록하세요.' : '회사 DB를 여는 중입니다.'}
          </p>
        )}
      </section>
    </div>
  )
}
