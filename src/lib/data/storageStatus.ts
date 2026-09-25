export type StorageFacts = {
  savedHere: boolean
  deviceStatus: string | null
  pendingReceive: number
}

export function savedOnThisDevice(persistOk: boolean, vfsName: string) {
  return persistOk && (vfsName === 'opfs-sahpool' || vfsName === 'opfs')
}

export function showsWorkDbReopen(openFailed: boolean) {
  return openFailed
}

export function workOpenedNotice(guest: boolean) {
  return guest ? '샘플이 열렸습니다. 저장되지 않습니다.' : ''
}

export function deviceSavedLabel(status: string | null) {
  if (status === 'confirmed') return '예'
  if (status === 'reserved') return '예약만 됨'
  return '아니오'
}

export function canConfirmOriginalDevice(input: {
  savedHere: boolean
  deviceStatus: string | null
  isAdmin: boolean
}) {
  return input.savedHere && input.isAdmin && input.deviceStatus === 'reserved'
}

export function storageLines(facts: StorageFacts) {
  const pending = facts.pendingReceive > 0 ? `${facts.pendingReceive}건` : '없음'
  return [
    { label: '이 기기에 저장됨', value: facts.savedHere ? '예' : '아니오' },
    { label: '관리자 PC 저장 완료', value: deviceSavedLabel(facts.deviceStatus) },
    { label: '처리 확인 필요', value: pending },
  ]
}
