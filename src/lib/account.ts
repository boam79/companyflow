import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeInviteEmail } from './invite'

export function canDeleteOwnAccount(operator: boolean) {
  return !operator
}

export function deleteAccountConfirmMessage() {
  return '계정을 지우면 같은 이메일로 다시 가입하고 초대할 수 있습니다. 이 PC의 회사 원본 파일은 남습니다. 지우시겠습니까?'
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
