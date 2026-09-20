import { describe, expect, it } from 'vitest'
import type { AssetLifeEvent } from './life'
import { applyQrRegistration } from './register'
import {
  buildQrAssetDetail,
  findAssetByQrToken,
  phoneQrSavedMessage,
  qrHistoryLine,
} from './qrLookup'

const LABEL = 'b9f54e6d-1111-4111-8111-111111111111'

const PAYLOAD = {
  itemName: '책상',
  model: 'A-12',
  serialNo: 'SN-1',
  location: '본사 3층 총무석',
  departmentName: '총무',
  ownerName: '김담당',
  acquiredAt: '2026-09-18',
}

describe('등록 QR 자산 상세', () => {
  it('같은 표식으로 원본 자산과 이력을 찾는다', () => {
    const labels = [{ id: LABEL, status: 'blank' as const, createdAt: 't' }]
    const { assets, asset } = applyQrRegistration([], labels, {
      operationId: `qr-bind:${LABEL}`,
      labelId: LABEL,
      payload: PAYLOAD,
      createdAt: 't',
    })
    expect(findAssetByQrToken(assets, LABEL)?.id).toBe(asset.id)
    expect(findAssetByQrToken(assets, '22222222-2222-4222-8222-222222222222')).toBeUndefined()
    const events: AssetLifeEvent[] = [
      {
        id: 'e1',
        assetId: asset.id,
        kind: 'transfer',
        happenedAt: '2026-09-20',
        locationText: '본사 3층 총무석',
        reason: '자리 이동',
        createdAt: 't',
      },
    ]
    const detail = buildQrAssetDetail(asset, [{ id: 'item-desk', name: '책상' }], events)
    expect(detail).toMatchObject({
      assetId: asset.id,
      itemName: '책상',
      locationText: '본사 3층 총무석',
      departmentName: '총무',
      ownerName: '김담당',
      statusLabel: '사용',
    })
    expect(detail.assetNumber.startsWith('AST-')).toBe(true)
    expect(detail.history).toEqual(['이관 · 2026-09-20 · 본사 3층 총무석 · 자리 이동'])
    expect(qrHistoryLine(events[0])).toBe('이관 · 2026-09-20 · 본사 3층 총무석 · 자리 이동')
  })

  it('휴대폰에는 원본 상세를 보여 주지 않는다', () => {
    expect(phoneQrSavedMessage()).toMatch(/지정 PC/)
    expect(phoneQrSavedMessage()).not.toMatch(/현재고|최신/)
    expect(phoneQrSavedMessage(true)).toMatch(/샘플/)
    expect(phoneQrSavedMessage(true)).not.toMatch(/지정 PC/)
  })
})
