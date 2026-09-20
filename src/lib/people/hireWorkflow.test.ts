import { describe, expect, it } from 'vitest'
import {
  applyHireWorkflow,
  applyHireDocument,
  hireDocumentSummary,
  hireDocumentView,
  hireHistory,
  hireWorkflowCaption,
} from './hireWorkflow'

describe('입사 워크플로', () => {
  it('담당자·기한·첨부를 입사 워크플로에 둔다', () => {
    const next = applyHireWorkflow(undefined, {
      employeeId: 'emp-kim',
      ownerId: 'emp-park',
      dueAt: '2026-09-25',
      fileName: '입사서류.pdf',
      hasFile: true,
    })
    expect(next).toMatchObject({
      employeeId: 'emp-kim',
      ownerId: 'emp-park',
      dueAt: '2026-09-25',
      fileName: '입사서류.pdf',
      hasFile: true,
    })
    expect(hireWorkflowCaption({ ...next, ownerName: '박재민' }, '2026-09-20')).toBe('담당 박재민 · 기한 2026-09-25')
  })

  it('기한이 지났으면 입사 중 안내를 붙인다', () => {
    expect(
      hireWorkflowCaption(
        { ownerName: '김담당', dueAt: '2026-09-18' },
        '2026-09-20',
      ),
    ).toBe('담당 김담당 · 기한 2026-09-18 · 기한 지남')
  })

  it('완료 이력은 입사 저장과 지급만 보여 준다', () => {
    expect(
      hireHistory([
        { kind: 'hire', occurredAt: '2026-09-16' },
        { kind: 'hire_laptop', occurredAt: '2026-09-16' },
        { kind: 'leave', occurredAt: '2026-08-31' },
        { kind: 'hire_badge', occurredAt: '2026-09-17' },
      ]),
    ).toEqual([
      { at: '2026-09-16', label: '입사 저장' },
      { at: '2026-09-16', label: '노트북 지급' },
      { at: '2026-09-17', label: '명찰 지급' },
    ])
  })

  it('입사 서류는 근로계약·보안·개인정보·통장·신분증이다', () => {
    const empty = hireDocumentView('emp-1', [])
    expect(empty.map((row) => row.label)).toEqual([
      '근로계약서',
      '보안서약서',
      '개인정보 동의서',
      '통장사본',
      '신분증 사본',
    ])
    expect(hireDocumentSummary(empty)).toBe('서류 0/5')
    const next = applyHireDocument(empty, 'contract', true, '2026-09-20')
    expect(next.find((row) => row.key === 'contract')?.done).toBe(true)
    expect(hireDocumentSummary(next)).toBe('서류 1/5')
    expect(hireHistory([{ kind: 'hire_contract', occurredAt: '2026-09-20' }])).toEqual([
      { at: '2026-09-20', label: '근로계약서' },
    ])
  })
})
