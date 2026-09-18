export type OcrCandidate = {
  field: string
  value: string
  confidence: number
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

export const DISABLED_OCR: OcrAdapter = {
  enabled: false,
  async extract() {
    return {
      status: 'disabled',
      candidates: [],
      message: 'OCR은 아직 꺼져 있습니다. 직접 입력으로 계약 초안을 만드세요.',
    }
  },
}

export function describeOcrResult(input: {
  error?: string
  text: string
  candidateCount: number
  source?: 'pdf-text' | 'ocr'
}): string {
  if (input.error) {
    return `OCR을 끝내지 못했습니다. 직접 입력하세요. (${input.error})`
  }
  if (!input.text.trim()) {
    return '글자를 찾지 못했습니다. 위 칸을 직접 입력하세요. 원본은 이 PC에 남습니다.'
  }
  if (!input.candidateCount) {
    return '글자는 읽었지만 칸에 넣을 값을 못 찾았습니다. 아래를 보고 직접 입력하세요.'
  }
  return input.source === 'pdf-text'
    ? 'PDF 글자로 후보를 채웠습니다. 확인하고 고친 뒤 초안을 저장하세요. OCR만으로 체결하지 않습니다.'
    : '이 PC에서 OCR로 후보를 채웠습니다. 확인하고 고친 뒤 초안을 저장하세요. OCR만으로 체결하지 않습니다.'
}

export function assertOcrCannotConfirm(adapter: OcrAdapter = DISABLED_OCR): void {
  if (!adapter.enabled) return
  throw new Error('OCR 확인 전에는 계약을 체결 확정할 수 없습니다.')
}
