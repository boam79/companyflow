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

const FALLBACK = '요청을 처리하지 못했습니다.'

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

  const code = pickString(rec?.code)
  const blob = `${code} ${raw}`

  if (/companies_company_code_key|duplicate key[\s\S]*company_code/i.test(blob)) {
    return '이미 있는 회사코드입니다.'
  }
  if (/gen_random_bytes/i.test(blob)) {
    return '회사 관리자 초대를 만들지 못했습니다. 다시 시도하세요.'
  }
  if (/invalid login credentials|invalid_credentials/i.test(blob)) {
    return '이메일 또는 비밀번호가 올바르지 않습니다.'
  }
  if (/email not confirmed/i.test(blob)) {
    return '메일 확인이 끝나지 않았습니다. 스팸함도 보세요.'
  }
  if (/user already registered|already been registered|already registered/i.test(blob)) {
    return '이미 있는 계정입니다. 위 로그인으로 들어오세요.'
  }
  if (/password should be|weak password|password is known to be/i.test(blob)) {
    return '더 긴 비밀번호를 쓰세요.'
  }
  if (/rate limit|too many requests|over_request_rate/i.test(blob)) {
    return '잠시 후 다시 시도하세요.'
  }
  if (/signup is disabled/i.test(blob)) {
    return '지금은 회원가입을 받지 않습니다.'
  }
  if (/permission denied|not authorized|row-level security|rls/i.test(blob)) {
    return '이 작업 권한이 없습니다.'
  }
  if (/jwt expired|invalid jwt|invalid claim/i.test(blob)) {
    return '로그인이 만료되었습니다. 다시 로그인하세요.'
  }
  if (!raw) return FALLBACK
  if (/[가-힣]/.test(raw)) return raw
  return FALLBACK
}
