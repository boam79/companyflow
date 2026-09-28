export type OcrCandidate = {
  field: string
  value: string
  confidence: number
  page?: number
  sourceText?: string
}

export type OcrFieldRecord = OcrCandidate & {
  reviewedValue?: string
}

export type OcrExtractResult = {
  status: 'disabled' | 'empty' | 'ready'
  candidates: OcrCandidate[]
  text?: string
  message: string
}

export type OcrAdapter = {
  enabled: boolean
  extract: (input: { fileName?: string }) => Promise<OcrExtractResult>
}

export type OcrJobStatus = 'idle' | 'running' | 'review' | 'done' | 'failed'

export const OCR_FIELD_LABELS: Record<string, string> = {
  title: '계약명',
  contractNo: '계약번호',
  counterparty: '상대방',
  ownerName: '담당자',
  signedAt: '체결일',
  startAt: '시작일',
  endAt: '종료일',
  amount: '금액',
}

export const DISABLED_OCR: OcrAdapter = {
  enabled: false,
  async extract() {
    return {
      status: 'disabled',
      candidates: [],
      message: 'OCR이 꺼져 있습니다. 직접 입력으로 계약 초안을 만드세요.',
    }
  },
}

export function describeOcrResult(input: {
  error?: string
  text: string
  candidateCount: number
  source?: 'pdf-text' | 'ocr'
  truncatedPages?: number
}): string {
  if (input.error) {
    const friendly = /attempting to read image|could not decode|unable to decode|EncodingError/i.test(input.error)
      ? '이 그림을 열 수 없습니다. PNG 또는 JPEG로 다시 저장해 보세요.'
      : input.error
    return `OCR을 끝내지 못했습니다. 다시 읽거나 직접 입력하세요. (${friendly})`
  }
  const truncated = input.truncatedPages ? ` 앞 ${input.truncatedPages}쪽만 읽었습니다.` : ''
  if (!input.text.trim()) {
    return `이 그림에서 글자를 찾지 못했습니다. 다시 읽거나, 계약 문구가 보이는 PDF나 스캔을 올리거나, 위 칸을 직접 입력하세요. 원본은 그대로 둡니다.${truncated}`
  }
  if (!input.candidateCount) {
    return `글자는 읽었지만 칸에 넣을 값을 못 찾았습니다. 아래를 보고 직접 입력하세요. 원본은 그대로 둡니다.${truncated}`
  }
  const lead =
    input.source === 'pdf-text'
      ? 'PDF 글자로 후보를 채웠습니다. 인식 근거를 보고 고친 뒤 초안을 저장하세요. OCR만으로 체결하지 않습니다.'
      : '이 PC에서 OCR로 후보를 채웠습니다. 인식 근거를 보고 고친 뒤 초안을 저장하세요. OCR만으로 체결하지 않습니다.'
  return `${lead}${truncated}`
}

export function ocrRetryLabel() {
  return '다시 읽기'
}

export function ocrCancelLabel() {
  return '그만 읽기'
}

export function ocrConfirmLabel() {
  return '원본과 칸을 확인했습니다'
}

export function ocrConfirmHint() {
  return '확인하고 고친 값으로 초안만 저장합니다. OCR만으로 체결하지 않습니다.'
}

export function ocrJobCaption(status: OcrJobStatus) {
  if (status === 'running') return '처리 중'
  if (status === 'review') return '확인 필요'
  if (status === 'done') return '완료'
  if (status === 'failed') return '실패'
  return ''
}

export function ocrJobStatus(input: {
  busy: boolean
  failed: boolean
  candidateCount: number
  reviewed: boolean
  waitingConfirm?: boolean
}): OcrJobStatus {
  if (input.busy) return 'running'
  if (input.failed) return 'failed'
  if (input.reviewed) return 'done'
  if (input.candidateCount || input.waitingConfirm) return 'review'
  return 'idle'
}

export function ocrFailedMessage(message: string) {
  return /끝내지 못했|글자를 찾지 못했|읽기를 멈췄/.test(message)
}

export function ocrEvidenceLine(row: OcrFieldRecord) {
  const label = OCR_FIELD_LABELS[row.field] ?? row.field
  const parts = [label, `인식 ${Math.round(row.confidence * 100)}%`]
  if (row.page) parts.push(`${row.page}쪽`)
  if (row.sourceText && row.sourceText !== row.value) parts.push(row.sourceText)
  const reviewed = row.reviewedValue?.trim()
  if (reviewed && reviewed !== row.value) parts.push(`확인 ${reviewed}`)
  return parts.join(' · ')
}

export function parseOcrFieldsJson(raw?: string | null): OcrFieldRecord[] {
  if (!raw?.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((row) => {
      if (!row || typeof row !== 'object') return []
      const rec = row as Record<string, unknown>
      if (typeof rec.field !== 'string' || typeof rec.value !== 'string') return []
      return [
        {
          field: rec.field,
          value: rec.value,
          confidence: typeof rec.confidence === 'number' ? rec.confidence : 0,
          page: typeof rec.page === 'number' ? rec.page : undefined,
          sourceText: typeof rec.sourceText === 'string' ? rec.sourceText : undefined,
          reviewedValue: typeof rec.reviewedValue === 'string' ? rec.reviewedValue : undefined,
        },
      ]
    })
  } catch {
    return []
  }
}

export function assertOcrCannotConfirm(adapter: OcrAdapter = DISABLED_OCR): void {
  if (!adapter.enabled) return
  throw new Error('OCR 확인 전에는 계약을 체결 확정할 수 없습니다.')
}
