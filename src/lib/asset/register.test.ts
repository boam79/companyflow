import { describe, expect, it } from 'vitest'
import { assetsFromConvert } from './book'
import { applyQrRegistration, assertQrAssetPayload, itemIdForQrName } from './register'

const LABEL = '11111111-1111-4111-8111-111111111111'

const PAYLOAD = {
  itemName: '책상',
  model: 'A-12',
  serialNo: 'SN-1',
  location: '본사 3층',
  departmentName: '총무',
  ownerName: '김담당',
  acquiredAt: '2026-09-18',
}

describe('빈 QR 자산 등록', () => {
  it('스마트폰 입력으로 책상·컴퓨터를 원본 자산으로 만든다', () => {
    const labels = [{ id: LABEL, status: 'blank' as const, createdAt: 't' }]
    const result = applyQrRegistration([], labels, {
      operationId: `qr-bind:${LABEL}`,
      labelId: LABEL,
      payload: PAYLOAD,
      createdAt: 't',
    })
    expect(result.asset).toMatchObject({
      id: `${LABEL}:1`,
      itemId: 'item-desk',
      qrToken: LABEL,
      model: 'A-12',
      serialNo: 'SN-1',
      locationText: '본사 3층',
      departmentName: '총무',
      ownerName: '김담당',
      acquiredAt: '2026-09-18',
      status: 'in_storage',
    })
    expect(result.labels[0].status).toBe('bound')
    expect(itemIdForQrName('컴퓨터')).toBe('item-computer')
    expect(itemIdForQrName('모니터')).toBe('item-monitor')
    expect(itemIdForQrName('의자')).toBe('item-chair')
  })

  it('복사용지 같은 비품과 이미 저장된 QR은 막는다', () => {
    expect(() => assertQrAssetPayload({ itemName: '복사용지', location: '창고' })).toThrow(/회사 자산/)
    expect(() => assertQrAssetPayload({ itemName: '책상' })).toThrow(/위치/)
    const labels = [{ id: LABEL, status: 'blank' as const, createdAt: 't' }]
    const first = applyQrRegistration([], labels, {
      operationId: `qr-bind:${LABEL}`,
      labelId: LABEL,
      payload: PAYLOAD,
      createdAt: 't',
    })
    expect(() =>
      applyQrRegistration(first.assets, first.labels, {
        operationId: 'again',
        labelId: LABEL,
        payload: PAYLOAD,
        createdAt: 't',
      }),
    ).toThrow(/이미 저장/)
    expect(() =>
      applyQrRegistration(assetsFromConvert('op', 'item-desk', 'wh-main', 1, 't'), labels, {
        operationId: 'x',
        labelId: '22222222-2222-4222-8222-222222222222',
        payload: PAYLOAD,
        createdAt: 't',
      }),
    ).toThrow(/빈 QR/)
  })
})
