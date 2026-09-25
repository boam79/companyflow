export const APP_ORIGIN = 'https://companyflow-opal.vercel.app'

export function signupEmailRedirectTo() {
  return `${APP_ORIGIN}/login`
}

export function signupDoneMessage() {
  return '계정을 만들었습니다. 초대받은 이메일이면 메일을 기다리지 말고 위 로그인으로 들어오세요. 확인 메일이 안 오면 스팸함을 보세요.'
}

export function loginPageLead() {
  return '계정이 없으면 아래 회원가입에서 만듭니다.'
}

export function loginContinueLabel(next: string) {
  return next === '/' ? '홈으로' : '이어서'
}

export function afterSignOutHref() {
  return '/'
}

export function safeLoginNext(value: string | null | undefined) {
  const raw = (value ?? '').trim()
  if (/^\/q\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    return raw
  }
  return '/'
}

export function qrLoginHref(token: string) {
  return `/login?next=${encodeURIComponent(safeLoginNext(`/q/${token.trim()}`))}`
}
