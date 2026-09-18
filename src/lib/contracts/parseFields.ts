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

function labeledValue(text: string, labels: string): string | undefined {
  const pattern = new RegExp(`(?:${labels})\\s*[:：]?\\s*([^\\n]+)`, 'i')
  const match = text.match(pattern)
  const value = match?.[1]?.replace(/\s+/g, ' ').trim()
  return value || undefined
}

function add(candidates: OcrCandidate[], field: string, value: string | undefined, confidence = FIELD_CONFIDENCE[field] ?? 0.5) {
  const next = value?.replace(/\s+/g, ' ').trim()
  if (!next) return
  if (candidates.some((row) => row.field === field)) return
  candidates.push({ field, value: next, confidence })
}

export function parseContractText(text: string): OcrCandidate[] {
  const source = text.replace(/\r/g, '\n')
  const candidates: OcrCandidate[] = []

  add(
    candidates,
    'contractNo',
    labeledValue(source, '계약번호|계약\\s*No\\.?|Contract\\s*No\\.?') || source.match(/CON[- ]?\d{2,}[- ]?\d*/i)?.[0]?.replace(/\s/g, '-'),
  )

  add(candidates, 'title', labeledValue(source, '계약명|건명|계약\\s*명칭'))
  if (!candidates.some((row) => row.field === 'title')) {
    const line = source
      .split('\n')
      .map((row) => row.trim())
      .find((row) => row.length >= 4 && /계약|임대|유지보수|보험|용역/.test(row) && !/계약서$/.test(row) && !/계약번호/.test(row))
    add(candidates, 'title', line, 0.45)
  }

  add(
    candidates,
    'counterparty',
    labeledValue(source, '상대방|거래처|임대인|수급인|공급자|발주처'),
  )

  add(candidates, 'ownerName', labeledValue(source, '담당자|관리자'))

  const signed = labeledValue(source, '체결일|계약일')
  const start = labeledValue(source, '시작일|개시일|임대시작')
  const end = labeledValue(source, '종료일|만료일|임대종료')
  add(candidates, 'signedAt', signed ? toIsoDate(signed) : undefined)
  add(candidates, 'startAt', start ? toIsoDate(start) : undefined)
  add(candidates, 'endAt', end ? toIsoDate(end) : undefined)

  if (!candidates.some((row) => row.field === 'startAt' || row.field === 'endAt' || row.field === 'signedAt')) {
    const dates = [...source.matchAll(/(\d{4})\s*[년.\-/]\s*(\d{1,2})\s*[월.\-/]\s*(\d{1,2})\s*일?/g)]
      .map((match) => toIsoDate(match[0]))
      .filter((value): value is string => Boolean(value))
    add(candidates, 'signedAt', dates[0], 0.5)
    add(candidates, 'startAt', dates[0], 0.5)
    add(candidates, 'endAt', dates[1], 0.5)
  }

  const amounts = [...source.matchAll(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,})\s*원/g)]
    .map((match) => Number(match[1].replace(/,/g, '')))
    .filter((value) => Number.isFinite(value) && value > 0)
  if (amounts.length) {
    add(candidates, 'amount', String(Math.max(...amounts)))
  }

  return candidates
}

export function applyOcrCandidates(form: ContractFormDraft, candidates: OcrCandidate[]): ContractFormDraft {
  const next = { ...form }
  for (const row of candidates) {
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
