import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { executeAssignAsset, executeIssueAsset, executeReturnAsset, loadAssets, type AssetRecord } from '../lib/asset/book'
import { issueChecklist } from '../lib/asset/nextAssign'
import { ISSUE_ITEMS, writeDefaultMaster } from '../lib/master/book'
import {
  badgeLines,
  executeHire,
  executeLeave,
  loadEmployees,
  type EmployeeRecord,
} from '../lib/people/employment'
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
  const [assets, setAssets] = useState<AssetRecord[]>([])
  const [drafts, setDrafts] = useState<Record<string, { hiredAt: string; title: string; badgeName: string }>>(
    {},
  )
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
      const [deptRows, employeeRows, assetRows] = await Promise.all([
        sqlite.query<NamedRow>('select id, name from departments order by name'),
        loadEmployees(sqlite),
        loadAssets(sqlite),
      ])
      setDepartments(deptRows)
      setEmployees(employeeRows)
      setAssets(assetRows)
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
    const [employeeRows, assetRows] = await Promise.all([loadEmployees(sqlite), loadAssets(sqlite)])
    setEmployees(employeeRows)
    setAssets(assetRows)
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
            ? '재입사했습니다. 자산 배정을 이어갈 수 있습니다.'
            : '입사를 기록했습니다.',
      )
      await refreshPeople()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function assignNext(assetId: string, employeeId: string) {
    setMessage('')
    setNotice('')
    try {
      const result = await executeAssignAsset(sqlite, {
        operationId: crypto.randomUUID(),
        assetId,
        employeeId,
      })
      const employeeName = employees.find((row) => row.id === employeeId)?.name ?? employeeId
      setNotice(
        result.status === 'duplicate'
          ? '같은 배정은 한 번만 반영됩니다.'
          : `지급했습니다. ${employeeName}. 퇴사하려면 명찰·유니폼·노트북을 먼저 회수하세요.`,
      )
      await refreshPeople()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function returnNext(assetId: string) {
    setMessage('')
    setNotice('')
    try {
      const result = await executeReturnAsset(sqlite, {
        operationId: crypto.randomUUID(),
        assetId,
      })
      setNotice(result.status === 'duplicate' ? '같은 회수는 한 번만 반영됩니다.' : '지급품을 회수했습니다.')
      await refreshPeople()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function issueNext(itemId: string, employeeId: string, itemName: string) {
    setMessage('')
    setNotice('')
    try {
      const result = await executeIssueAsset(sqlite, {
        operationId: crypto.randomUUID(),
        itemId,
        employeeId,
      })
      setNotice(
        result.status === 'duplicate'
          ? '같은 지급은 한 번만 반영됩니다.'
          : `${itemName}을 지급했습니다. 퇴사 전에 회수합니다.`,
      )
      await refreshPeople()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function toggleIssue(
    employeeId: string,
    row: { itemId: string; itemName: string; held?: AssetRecord; stored?: AssetRecord },
    checked: boolean,
  ) {
    if (checked) {
      if (row.held) return
      if (row.stored) {
        await assignNext(row.stored.id, employeeId)
        return
      }
      await issueNext(row.itemId, employeeId, row.itemName)
      return
    }
    if (row.held) await returnNext(row.held.id)
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
          입사·퇴사 지급품은 명찰·유니폼·노트북 체크리스트로 봅니다. 복사용지 같은 회사 재고는 대상이 아닙니다.
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
        <Link className="rounded border border-line px-3 py-2 text-sm" to="/assets">
          자산 배정·회수
        </Link>
        <Link className="rounded border border-line px-3 py-2 text-sm" to="/master">
          기준정보
        </Link>
      </div>
      {notice ? <p className="text-sm text-ok">{notice}</p> : null}
      {message ? <p className="text-sm text-danger">{message}</p> : null}
      <section className="rounded-lg border border-line bg-card p-5">
        {employees.length ? (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="py-2 pr-3 font-medium">이름</th>
                <th className="py-2 pr-3 font-medium">부서</th>
                <th className="py-2 pr-3 font-medium">입사</th>
                <th className="py-2 pr-3 font-medium">지급품</th>
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
                const checks = issueChecklist(assets, employee.id, ISSUE_ITEMS)
                const held = checks.filter((row) => row.held).length
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
                        {checks.map((row) => (
                          <li key={row.itemId}>
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                className="size-4 accent-accent"
                                checked={Boolean(row.held)}
                                disabled={!ready || Boolean(employee.leftAt)}
                                onChange={(e) => void toggleIssue(employee.id, row, e.target.checked)}
                              />
                              <span className={row.held ? 'font-medium' : 'text-muted'}>{row.itemName}</span>
                              <span className="text-xs text-muted">
                                {row.held ? '지급' : row.stored ? '보관' : '미지급'}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1 text-xs text-muted">
                        {held}/{checks.length} 지급
                        {held ? ' · 퇴사 전 체크 해제(회수)' : ' · 퇴사 가능'}
                      </p>
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
                            printBadge(badgeLines({ ...employee, ...draft, name: employee.name }, deptName))
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
