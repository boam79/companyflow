export type OcrCandidate = {
  field: string
  value: string
  confidence: number
}

export type OcrExtractResult = {
  status: 'disabled' | 'empty' | 'ready'
  candidates: OcrCandidate[]
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

export function assertOcrCannotConfirm(adapter: OcrAdapter = DISABLED_OCR): void {
  if (!adapter.enabled) return
  throw new Error('OCR 확인 전에는 계약을 체결 확정할 수 없습니다.')
}
