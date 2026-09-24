import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeInviteEmail } from './invite'

export function canDeleteOwnAccount(operator: boolean) {
  return !operator
}

/** 일반 화면 헤더에는 계정 삭제를 두지 않는다. 테스트 계정은 회사 관리에서만 지운다. */
export function showHeaderAccountDelete() {
  return false
}

export function shouldDropCompanyWithAccount(input: {
  operatorIsMember: boolean
  otherCompanyAdmins: boolean
  thisUserIsCompanyAdmin: boolean
  thisUserIsLinked: boolean
  otherPeopleRemain: boolean
}) {
  if (!input.thisUserIsLinked) return false
  if (input.operatorIsMember) return false
  if (input.otherCompanyAdmins) return false
  if (input.thisUserIsCompanyAdmin) return true
  return !input.otherPeopleRemain
}

export function shouldDropEmptyCompanyOnOperatorDelete(input: {
  hasMembers: boolean
  hasInvites: boolean
  operatorIsMember: boolean
}) {
  if (input.operatorIsMember) return false
  return !input.hasMembers && !input.hasInvites
}

export function deleteAccountConfirmMessage() {
  return '계정을 지우면 같은 이메일로 다시 가입할 수 있습니다. 그 사람이 회사 관리자인 회사(지점)도 중앙에서 지웁니다. 운영자가 멤버인 회사는 남습니다. 이 PC의 회사 원본 파일은 남습니다. 지우시겠습니까?'
}

export function operatorDeleteAccountConfirmMessage() {
  return '계정을 지우면 같은 이메일로 다시 가입할 수 있습니다. 그 사람이 관리하던 회사와, 사람이 없는 회사(지점)도 중앙에서 지웁니다. 본사는 남습니다. 이 PC의 회사 원본 파일은 남습니다. 지우시겠습니까?'
}

export async function deleteOwnAccount(client: SupabaseClient) {
  const { error } = await client.rpc('delete_own_account')
  if (error) throw error
}

export async function operatorDeleteAuthUser(client: SupabaseClient, email: string) {
  const { error } = await client.rpc('operator_delete_auth_user', {
    p_email: normalizeInviteEmail(email),
  })
  if (error) throw error
}
