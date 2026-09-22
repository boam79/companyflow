export type InviteRole = 'company_admin' | 'member'

export function normalizeInviteEmail(value: string) {
  const email = value.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('이메일 형식이 아닙니다.')
  }
  return email
}

export function assertInviteRole(role: string): InviteRole {
  if (role === 'company_admin' || role === 'member') return role
  throw new Error('허용되지 않은 역할입니다.')
}
