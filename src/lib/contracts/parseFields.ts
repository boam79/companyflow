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

function add(candidates: OcrCandidate[], field: string, value: string | undefined, confidence = FIELD_CONFIDENCE[field] ?? 0.5) {
  const next = value ? tidyOcrValue(value) : ''
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
    (labeledValue(source, '계약번호|계약\\s*No\\.?|Contract\\s*No\\.?') || source).match(
      /CON-?[A-Z0-9]+(?:-[A-Z0-9]+)*/i,
    )?.[0],
  )

  add(candidates, 'title', labeledValue(source, '계약명|건명|계약\\s*명칭|Contract\\s*title|Title'))
  if (!candidates.some((row) => row.field === 'title')) {
    const line = source
      .split('\n')
      .map((row) => row.trim())
      .find((row) => row.length >= 4 && /계약|임대|유지보수|보험|용역|lease/i.test(row) && !/계약서$/.test(row) && !/계약번호|Contract\\s*No/i.test(row))
    add(candidates, 'title', line, 0.45)
  }

  add(
    candidates,
    'counterparty',
    labeledValue(source, '상대방|거래처|임대인|수급인|공급자|발주처|Counterparty'),
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
  if (!amounts.length) {
    const labeledAmount = labeledValue(source, '계약금액|금액|Amount')
    const numeric = labeledAmount?.replace(/[^0-9]/g, '')
    if (numeric) amounts.push(Number(numeric))
  }
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
