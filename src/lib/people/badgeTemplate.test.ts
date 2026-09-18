import { describe, expect, it } from 'vitest'
import {
  applyBadgeLines,
  assertBadgeTemplateFile,
  detectBadgeFields,
  inspectBadgeTemplate,
} from './badgeTemplate'

function pdfWithLiterals(...labels: string[]) {
  const body = labels.map((label) => `(${label}) Tj`).join(' ')
  return new TextEncoder().encode(`%PDF-1.4\nstream\nBT ${body} ET\nendstream\n%%EOF`)
}

describe('명찰 템플릿', () => {
  it('PDF·AI만 받고 용량을 제한한다', () => {
    expect(assertBadgeTemplateFile(12, 'application/pdf', 'badge.pdf')).toBe('application/pdf')
    expect(assertBadgeTemplateFile(12, 'application/postscript', 'badge.ai')).toBe('application/illustrator')
    expect(() => assertBadgeTemplateFile(12, 'image/png', 'badge.png')).toThrow(/PDF·AI/)
    expect(() => assertBadgeTemplateFile(9 * 1024 * 1024, 'application/pdf', 'badge.pdf')).toThrow(/8MB/)
  })

  it('텍스트에서 성명·부서·직위 칸을 나타난 순서로 찾는다', () => {
    expect(detectBadgeFields('회사명 부서 성명 직위')).toEqual([
      { key: 'company', label: '회사명' },
      { key: 'department', label: '부서' },
      { key: 'name', label: '성명' },
      { key: 'title', label: '직위' },
    ])
  })

  it('PDF 문자열에서 칸을 파악한다', async () => {
    const found = await inspectBadgeTemplate(pdfWithLiterals('성명', '부서', '직위'), 'badge.pdf')
    expect(found.sourceKind).toBe('pdf')
    expect(found.fields.map((row) => row.key)).toEqual(['name', 'department', 'title'])
  })

  it('PDF 호환 .ai도 칸을 파악한다', async () => {
    const found = await inspectBadgeTemplate(pdfWithLiterals('이름', '소속'), 'nameplate.ai')
    expect(found.sourceKind).toBe('ai-pdf')
    expect(found.fields.map((row) => row.key)).toEqual(['name', 'department'])
  })

  it('PDF가 아닌 .ai는 원본으로 두고 한글 라벨이 있으면 칸을 읽는다', async () => {
    const bytes = new TextEncoder().encode('Illustrator 비호환 성명 부서')
    const found = await inspectBadgeTemplate(bytes, 'badge.ai')
    expect(found.sourceKind).toBe('ai-binary')
    expect(found.fields.map((row) => row.key)).toEqual(['name', 'department'])
  })

  it('라벨이 없는 바이너리 .ai는 칸이 비어 있다', async () => {
    const found = await inspectBadgeTemplate(new Uint8Array([0, 1, 2, 3, 4, 5]), 'badge.ai')
    expect(found.sourceKind).toBe('ai-binary')
    expect(found.fields).toEqual([])
  })

  it('파악한 칸 순서로 직원 값을 넣는다', () => {
    const lines = applyBadgeLines(
      { name: '김담당', badgeName: '김 담당', title: '주임' },
      '총무',
      [
        { key: 'department', label: '부서' },
        { key: 'name', label: '성명' },
        { key: 'title', label: '직위' },
      ],
    )
    expect(lines).toEqual(['총무', '김 담당', '주임'])
  })

  it('칸을 못 찾으면 기본 명찰 줄을 쓴다', () => {
    expect(applyBadgeLines({ name: '김담당', title: '주임' }, '총무', [])).toEqual([
      '김담당',
      '총무',
      '주임',
    ])
  })
})
