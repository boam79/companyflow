import { describe, expect, it } from 'vitest'
import { deviceSavedLabel, savedOnThisDevice, storageLines } from './storageStatus'

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

  it('수신 대기는 처리 확인이고 전송·백업은 열지 않는다', () => {
    const lines = storageLines({ savedHere: true, deviceStatus: 'reserved', pendingReceive: 2 })
    expect(lines).toEqual([
      { label: '이 기기에 저장됨', value: '예' },
      { label: '전송 대기', value: '없음' },
      { label: '관리자 PC 저장 완료', value: '예약만 됨' },
      { label: '처리 확인 필요', value: '2건' },
      { label: '최근 백업', value: '없음' },
    ])
  })
})
