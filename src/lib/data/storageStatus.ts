export type StorageFacts = {
  savedHere: boolean
  deviceStatus: string | null
  pendingReceive: number
}

export function savedOnThisDevice(persistOk: boolean, vfsName: string) {
  return persistOk && (vfsName === 'opfs-sahpool' || vfsName === 'opfs')
}

export function deviceSavedLabel(status: string | null) {
  if (status === 'confirmed') return '예'
  if (status === 'reserved') return '예약만 됨'
  return '아니오'
}

export function storageLines(facts: StorageFacts) {
  const pending = facts.pendingReceive > 0 ? `${facts.pendingReceive}건` : '없음'
  return [
    { label: '이 기기에 저장됨', value: facts.savedHere ? '예' : '아니오' },
    { label: '전송 대기', value: '없음' },
    { label: '관리자 PC 저장 완료', value: deviceSavedLabel(facts.deviceStatus) },
    { label: '처리 확인 필요', value: pending },
    { label: '최근 백업', value: '없음' },
  ]
}
