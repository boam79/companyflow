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

export function dataPageLead(companyName?: string) {
  const who = companyName?.trim() ? `${companyName.trim()}의 ` : ''
  return `${who}이 브라우저 저장 상태입니다.`
}

export function storageLines(facts: StorageFacts) {
  const lines = [
    { label: '이 기기에 저장됨', value: facts.savedHere ? '예' : '아니오' },
    { label: '관리자 PC 저장 완료', value: deviceSavedLabel(facts.deviceStatus) },
  ]
  if (facts.pendingReceive > 0) {
    lines.push({ label: '처리 확인 필요', value: `${facts.pendingReceive}건` })
  }
  return lines
}
