import { describe, expect, it } from 'vitest'
import { assetsFromConvert } from './book'
import { COMPANY_ASSET_ITEMS, PAPER_ITEM } from '../master/book'
import { applyQrRegistration, assertQrAssetPayload, itemIdForQrName, readQrAssetForm } from './register'

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
      items: COMPANY_ASSET_ITEMS,
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
    expect(() =>
      applyQrRegistration([], labels, {
        operationId: `qr-bind:${LABEL}`,
        labelId: LABEL,
        payload: PAYLOAD,
        createdAt: 't',
      }),
    ).toThrow(/회사 자산/)
    expect(itemIdForQrName('컴퓨터', COMPANY_ASSET_ITEMS)).toBe('item-computer')
    expect(itemIdForQrName('모니터', COMPANY_ASSET_ITEMS)).toBe('item-monitor')
    expect(itemIdForQrName('의자', COMPANY_ASSET_ITEMS)).toBe('item-chair')
    expect(itemIdForQrName('샘플 책상', [{ ...COMPANY_ASSET_ITEMS[0], name: '샘플 책상' }])).toBe('item-desk')
    expect(() => itemIdForQrName('책상', [])).toThrow(/회사 자산/)
    expect(() => itemIdForQrName('복사용지', [PAPER_ITEM])).toThrow(/회사 자산/)
  })

  it('복사용지 같은 비품과 이미 저장된 QR은 막는다', () => {
    expect(() => assertQrAssetPayload({ itemName: '복사용지', location: '창고' }, [PAPER_ITEM])).toThrow(/회사 자산/)
    expect(() => assertQrAssetPayload({ itemName: '책상' }, COMPANY_ASSET_ITEMS)).toThrow(/위치/)
    const labels = [{ id: LABEL, status: 'blank' as const, createdAt: 't' }]
    const first = applyQrRegistration([], labels, {
      operationId: `qr-bind:${LABEL}`,
      labelId: LABEL,
      payload: PAYLOAD,
      createdAt: 't',
      items: COMPANY_ASSET_ITEMS,
    })
    expect(() =>
      applyQrRegistration(first.assets, first.labels, {
        operationId: 'again',
        labelId: LABEL,
        payload: PAYLOAD,
        createdAt: 't',
        items: COMPANY_ASSET_ITEMS,
      }),
    ).toThrow(/이미 저장/)
    expect(() =>
      applyQrRegistration(assetsFromConvert('op', 'item-desk', 'wh-main', 1, 't'), labels, {
        operationId: 'x',
        labelId: '22222222-2222-4222-8222-222222222222',
        payload: PAYLOAD,
        createdAt: 't',
        items: COMPANY_ASSET_ITEMS,
      }),
    ).toThrow(/빈 QR/)
  })

  it('풀어 쓴 한글은 한 글자로 모아 저장한다', () => {
    const data = new FormData()
    data.set('itemName', '책상')
    data.set('model', '우드라인')
    data.set('serialNo', 'DSK-001')
    data.set('location', '본사 3층'.normalize('NFD'))
    data.set('departmentName', '총무'.normalize('NFD'))
    data.set('ownerName', '김담당')
    data.set('acquiredAt', '2026-09-18')
    expect(readQrAssetForm(data, COMPANY_ASSET_ITEMS)).toMatchObject({
      itemName: '책상',
      location: '본사 3층',
      departmentName: '총무',
      ownerName: '김담당',
    })
  })
})
