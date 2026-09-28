import type { OcrCandidate } from './ocr'

export type ContractFormDraft = {
  title: string
  contractNo: string
  counterparty: string
  signedAt: string
  startAt: string
  endAt: string
  amount: string
  ownerName: string
  partnerId?: string
  orderId?: string
}

const FIELD_CONFIDENCE: Record<string, number> = {
  contractNo: 0.85,
  amount: 0.8,
  signedAt: 0.75,
  startAt: 0.75,
  endAt: 0.75,
  title: 0.6,
  counterparty: 0.65,
  ownerName: 0.7,
}

export function toIsoDate(raw: string): string | undefined {
  const ko = raw.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/)
  const iso = raw.match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/)
  const match = ko ?? iso
  if (!match) return undefined
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
}

const NEXT_FIELD =
  '계약명|건명|계약번호|상대방|거래처|담당자|체결일|시작일|종료일|계약금액|금액|Amount|Contract\\s*No\\.?|Contract\\s*title|Counterparty|Title'

function flexLabels(labels: string): string {
  return labels.replace(/[가-힣]/g, (ch) => `${ch}\\s*`)
}

export function tidyOcrValue(value: string): string {
  const tokens = value.trim().split(/\s+/)
  const singleHangul = tokens.filter((token) => /^[\uAC00-\uD7A3]$/.test(token)).length
  let next = value
  if (singleHangul >= 3 && singleHangul >= tokens.length / 2) {
    let prev = ''
    while (next !== prev) {
      prev = next
      next = next
        .replace(/([\uAC00-\uD7A3])[ \t]+(?=[\uAC00-\uD7A3])/g, '$1')
        .replace(/([\uAC00-\uD7A3])[ \t]+(?=\d)/g, '$1')
        .replace(/(\d)[ \t]+(?=[\uAC00-\uD7A3])/g, '$1')
    }
  }
  return next.replace(/\s+/g, ' ').trim()
}

function labeledValue(text: string, labels: string): string | undefined {
  const pattern = new RegExp(
    `(?:${flexLabels(labels)})\\s*[:：]?\\s*(.+?)(?=\\s+(?:${flexLabels(NEXT_FIELD)})(?:\\s|[:：]|$)|$)`,
    'is',
  )
  const match = text.match(pattern)
  const value = match?.[1] ? tidyOcrValue(match[1]) : undefined
  return value || undefined
}

type AddMeta = { confidence?: number; page?: number; sourceText?: string }

function add(
  candidates: OcrCandidate[],
  field: string,
  value: string | undefined,
  extra?: number | AddMeta,
) {
  const meta: AddMeta = typeof extra === 'number' ? { confidence: extra } : extra ?? {}
  let next = value ? tidyOcrValue(value) : ''
  if (field === 'title') next = next.replace(/^[A-Za-z]{1,4}\s+(?=[\uAC00-\uD7A3])/, '')
  if (!next) return
  if (candidates.some((row) => row.field === field)) return
  const sourceText = tidyOcrValue(meta.sourceText ?? next).slice(0, 80)
  candidates.push({
    field,
    value: next,
    confidence: meta.confidence ?? FIELD_CONFIDENCE[field] ?? 0.5,
    page: meta.page,
    sourceText: sourceText || undefined,
  })
}

export type OcrPageText = { page: number; text: string }

export function parseContractText(text: string, page?: number): OcrCandidate[] {
  const source = text.replace(/\r/g, '\n')
  const candidates: OcrCandidate[] = []
  const at = (confidence?: number, sourceText?: string): AddMeta => ({
    confidence,
    page,
    sourceText,
  })

  const contractNo = (labeledValue(source, '계약번호|계약\\s*No\\.?|Contract\\s*No\\.?') || source).match(
    /CON-?[A-Z0-9]+(?:-[A-Z0-9]+)*/i,
  )?.[0]
  add(candidates, 'contractNo', contractNo, at(undefined, contractNo))

  const title = labeledValue(source, '계약명|건명|계약\\s*명칭|Contract\\s*title|Title')
  add(candidates, 'title', title, at(undefined, title))
  if (!candidates.some((row) => row.field === 'title')) {
    const line = source
      .split('\n')
      .map((row) => row.trim())
      .find(
        (row) =>
          row.length >= 4 &&
          /계약|임대|유지보수|보험|용역|lease/i.test(row) &&
          !/계약서$/.test(row) &&
          !/계약번호|계약금액|계약일|체결일|시작일|종료일|담당자|상대방|Contract\\s*No/i.test(row),
      )
    add(candidates, 'title', line, at(0.45, line))
  }

  const counterparty = labeledValue(source, '상대방|거래처|임대인|수급인|공급자|발주처|Counterparty')
  add(candidates, 'counterparty', counterparty, at(undefined, counterparty))

  const ownerName = labeledValue(source, '담당자|관리자')
  add(candidates, 'ownerName', ownerName, at(undefined, ownerName))

  const signed = labeledValue(source, '체결일|계약일')
  const start = labeledValue(source, '시작일|개시일|임대시작')
  const end = labeledValue(source, '종료일|만료일|임대종료')
  add(candidates, 'signedAt', signed ? toIsoDate(signed) : undefined, at(undefined, signed))
  add(candidates, 'startAt', start ? toIsoDate(start) : undefined, at(undefined, start))
  add(candidates, 'endAt', end ? toIsoDate(end) : undefined, at(undefined, end))

  if (!candidates.some((row) => row.field === 'startAt' || row.field === 'endAt' || row.field === 'signedAt')) {
    const dates = [...source.matchAll(/(\d{4})\s*[년.\-/]\s*(\d{1,2})\s*[월.\-/]\s*(\d{1,2})\s*일?/g)]
      .map((match) => ({ iso: toIsoDate(match[0]), raw: match[0] }))
      .filter((row): row is { iso: string; raw: string } => Boolean(row.iso))
    add(candidates, 'signedAt', dates[0]?.iso, at(0.5, dates[0]?.raw))
    add(candidates, 'startAt', dates[0]?.iso, at(0.5, dates[0]?.raw))
    add(candidates, 'endAt', dates[1]?.iso, at(0.5, dates[1]?.raw))
  }

  const amounts = [...source.matchAll(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,})\s*원/g)]
    .map((match) => ({ value: Number(match[1].replace(/,/g, '')), raw: match[0] }))
    .filter((row) => Number.isFinite(row.value) && row.value > 0)
  if (!amounts.length) {
    const labeledAmount = labeledValue(source, '계약금액|금액|Amount')
    const numeric = labeledAmount?.replace(/[^0-9]/g, '')
    if (numeric) amounts.push({ value: Number(numeric), raw: labeledAmount ?? numeric })
  }
  if (amounts.length) {
    const max = amounts.reduce((best, row) => (row.value > best.value ? row : best))
    add(candidates, 'amount', String(max.value), at(undefined, max.raw))
  }

  return candidates
}

export function parseContractDocument(pages: OcrPageText[]): OcrCandidate[] {
  const candidates: OcrCandidate[] = []
  for (const chunk of pages) {
    for (const row of parseContractText(chunk.text, chunk.page)) {
      if (!candidates.some((item) => item.field === row.field)) candidates.push(row)
    }
  }
  if (pages.length > 1) {
    for (const row of parseContractText(pages.map((chunk) => chunk.text).join('\n'))) {
      if (!candidates.some((item) => item.field === row.field)) candidates.push(row)
    }
  }
  return candidates
}

export function formValueForOcrField(form: ContractFormDraft, field: string): string {
  if (field === 'title') return form.title
  if (field === 'contractNo') return form.contractNo
  if (field === 'counterparty') return form.counterparty
  if (field === 'ownerName') return form.ownerName
  if (field === 'signedAt') return form.signedAt
  if (field === 'startAt') return form.startAt
  if (field === 'endAt') return form.endAt
  if (field === 'amount') return form.amount
  return ''
}

export function reviewedOcrFields(candidates: OcrCandidate[], form: ContractFormDraft) {
  return candidates.map((row) => ({
    ...row,
    reviewedValue: formValueForOcrField(form, row.field),
  }))
}

export const OCR_AUTOFILL_MIN = 0.5

export function applyOcrCandidates(form: ContractFormDraft, candidates: OcrCandidate[]): ContractFormDraft {
  const next = { ...form }
  for (const row of candidates) {
    if (row.confidence < OCR_AUTOFILL_MIN) continue
    if (row.field === 'title') next.title = row.value
    if (row.field === 'contractNo') next.contractNo = row.value
    if (row.field === 'counterparty') next.counterparty = row.value
    if (row.field === 'ownerName') next.ownerName = row.value
    if (row.field === 'signedAt') next.signedAt = row.value
    if (row.field === 'startAt') next.startAt = row.value
    if (row.field === 'endAt') next.endAt = row.value
    if (row.field === 'amount') next.amount = row.value
  }
  return next
}
