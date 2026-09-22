export const COMPANY_DISPLAY = {
  language: '한국어',
  timezone: '서울',
  currency: '원',
} as const

export function memberRoleLabel(role: string) {
  if (role === 'company_admin') return '회사 관리자'
  if (role === 'member') return '사용자'
  throw new Error('허용되지 않은 역할입니다.')
}
