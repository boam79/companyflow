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

export function afterInviteAcceptHref(role?: string) {
  return role === 'company_admin' ? '/setup' : '/'
}

export function inviteRoleLabel(role: string) {
  return role === 'company_admin' ? '회사 관리자' : '사용자'
}

export function homeInviteAcceptLabel(displayName: string) {
  return `${displayName} 수락`
}

export function waitingCoverLead(inviteCount: number) {
  if (inviteCount > 0) {
    return '아래 수락을 누르면 그 회사와 연결됩니다. 회사를 직접 만들 수는 없습니다.'
  }
  return '초대를 받은 뒤 이 화면에서 수락하세요. 회사를 직접 만들 수는 없습니다.'
}

export function showPendingInviteBanner(input: {
  pathname: string
  scanMode: boolean
  guest: boolean
  signedIn: boolean
}) {
  if (input.scanMode || input.guest || !input.signedIn) return false
  return input.pathname !== '/'
}
