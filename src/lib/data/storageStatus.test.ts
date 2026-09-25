import { describe, expect, it } from 'vitest'
import {
  canConfirmOriginalDevice,
  dataPageLead,
  deviceSavedLabel,
  savedOnThisDevice,
  showsWorkDbReopen,
  storageLines,
  workOpenedNotice,
} from './storageStatus'

describe('데이터 관리 저장 상태', () => {
  it('OPFS가 열린 브라우저만 이 기기에 저장된 것으로 본다', () => {
    expect(savedOnThisDevice(true, 'opfs-sahpool')).toBe(true)
    expect(savedOnThisDevice(true, 'opfs')).toBe(true)
    expect(savedOnThisDevice(true, 'memory')).toBe(false)
    expect(savedOnThisDevice(false, 'opfs-sahpool')).toBe(false)
  })

  it('확정된 장치만 관리자 PC 저장 완료다', () => {
    expect(deviceSavedLabel('confirmed')).toBe('예')
    expect(deviceSavedLabel('reserved')).toBe('예약만 됨')
    expect(deviceSavedLabel(null)).toBe('아니오')
  })

  it('원본이 열린 예약 장치만 회사 관리자가 확정한다', () => {
    expect(canConfirmOriginalDevice({ savedHere: true, deviceStatus: 'reserved', isAdmin: true })).toBe(true)
    expect(canConfirmOriginalDevice({ savedHere: true, deviceStatus: 'reserved', isAdmin: false })).toBe(false)
    expect(canConfirmOriginalDevice({ savedHere: false, deviceStatus: 'reserved', isAdmin: true })).toBe(false)
    expect(canConfirmOriginalDevice({ savedHere: true, deviceStatus: 'confirmed', isAdmin: true })).toBe(false)
  })

  it('업무 화면은 원본이 열린 뒤 VFS 이름과 다시 열기를 두지 않는다', () => {
    expect(workOpenedNotice(true)).toContain('샘플')
    expect(workOpenedNotice(false)).toBe('')
    expect(showsWorkDbReopen(false)).toBe(false)
    expect(showsWorkDbReopen(true)).toBe(true)
  })

  it('수신 대기는 있을 때만 처리 확인이고 전송·백업 줄은 두지 않는다', () => {
    const waiting = storageLines({ savedHere: true, deviceStatus: 'reserved', pendingReceive: 2 })
    expect(waiting).toEqual([
      { label: '이 기기에 저장됨', value: '예' },
      { label: '관리자 PC 저장 완료', value: '예약만 됨' },
      { label: '처리 확인 필요', value: '2건' },
    ])
    const idle = storageLines({ savedHere: true, deviceStatus: 'confirmed', pendingReceive: 0 })
    expect(idle.map((line) => line.label)).toEqual(['이 기기에 저장됨', '관리자 PC 저장 완료'])
    expect(waiting.map((line) => line.label).join(' ')).not.toMatch(/전송 대기|최근 백업/)
    expect(dataPageLead('재민')).toBe('이 브라우저에 저장된 재민 원본 상태입니다.')
    expect(dataPageLead()).toBe('이 브라우저 저장 상태입니다.')
    expect(dataPageLead()).not.toMatch(/백업|복원/)
  })
})
