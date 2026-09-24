export const APP_ORIGIN = 'https://companyflow-opal.vercel.app'

export function signupEmailRedirectTo() {
  return `${APP_ORIGIN}/login`
}

export function signupDoneMessage() {
  return '계정을 만들었습니다. 초대받은 이메일이면 메일을 기다리지 말고 위 로그인으로 들어오세요. 확인 메일은 네이버에서 막힐 수 있습니다.'
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
