function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object') return value as Record<string, unknown>
  return null
}

function pickString(value: unknown): string {
  if (typeof value !== 'string') return ''
  const text = value.trim()
  if (!text || text === '[object Object]') return ''
  return text
}

export function publicErrorMessage(error: unknown): string {
  const rec = asRecord(error)
  const nested = rec ? asRecord(rec.message) ?? asRecord(rec.error) : null
  const raw =
    pickString(rec?.message) ||
    pickString(nested?.message) ||
    pickString(rec?.details) ||
    pickString(nested?.details) ||
    (error instanceof Error ? pickString(error.message) : '') ||
    pickString(rec?.hint)

  if (/companies_company_code_key|duplicate key[\s\S]*company_code/i.test(raw)) {
    return '이미 있는 회사코드입니다.'
  }
  if (/gen_random_bytes/i.test(raw)) {
    return '회사 관리자 초대를 만들지 못했습니다. 다시 시도하세요.'
  }
  if (raw) return raw
  return '요청을 처리하지 못했습니다.'
}
