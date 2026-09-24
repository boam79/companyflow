export const APP_ORIGIN = 'https://companyflow-opal.vercel.app'

export function signupEmailRedirectTo() {
  return `${APP_ORIGIN}/login`
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
