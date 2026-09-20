import { describe, expect, it } from 'vitest'
import { contractRecent, contractWatchLabel, lowStock, peopleRecent, recentWork, stockRecent, waitingReceipts, watchContracts } from './work'

describe('홈 업무', () => {
  it('확정 발주 잔량만 수령 대기다', () => {
    expect(
      waitingReceipts([
        {
          orderId: 'ord-paper',
          itemName: '복사용지',
          remainingQty: 4,
          status: 'confirmed',
        },
        {
          orderId: 'ord-draft',
          itemName: '볼펜',
          remainingQty: 10,
          status: 'draft',
        },
        {
          orderId: 'ord-done',
          itemName: '책상',
          remainingQty: 0,
          status: 'confirmed',
        },
      ]).map((row) => row.orderId),
    ).toEqual(['ord-paper'])
  })

  it('계약 종료일이 지났으면 만료, 60일 안이면 만료 예정이다', () => {
    expect(contractWatchLabel('2026-02-28', '2026-09-20')).toBe('만료')
    expect(contractWatchLabel('2026-10-01', '2026-09-20')).toBe('만료 예정')
    expect(contractWatchLabel('2026-11-19', '2026-09-20')).toBe('만료 예정')
    expect(contractWatchLabel('2026-12-31', '2026-09-20')).toBe(null)
    expect(contractWatchLabel(undefined, '2026-09-20')).toBe(null)
  })

  it('홈 계약 기한은 종료일 빠른 순이다', () => {
    expect(
      watchContracts(
        [
          { title: '임대', counterparty: '한국임대', endAt: '2026-12-31' },
          { title: '복합기', counterparty: '사무기기코리아', endAt: '2026-02-28' },
          { title: '청소', counterparty: '클린서비스', endAt: '2026-10-01' },
        ],
        '2026-09-20',
      ).map((row) => [row.title, row.watch]),
    ).toEqual([
      ['복합기', '만료'],
      ['청소', '만료 예정'],
    ])
  })

  it('최근 작업은 지급 체크를 빼고 시각 늦은 순 8건이다', () => {
    const rows = recentWork([
      ...stockRecent(
        [
          {
            id: 'led-old',
            createdAt: '2026-09-01T09:00:00.000Z',
            txnType: 'receipt',
            itemId: 'item-paper',
            qtyDelta: 6,
          },
          {
            id: 'led-new',
            createdAt: '2026-09-20T11:00:00.000Z',
            txnType: 'issue',
            itemId: 'item-paper',
            qtyDelta: -4,
          },
          {
            id: 'led-asset',
            createdAt: '2026-09-20T12:00:00.000Z',
            txnType: 'convert_out',
            itemId: 'item-desk',
            qtyDelta: -2,
          },
        ],
        [{ id: 'item-paper', name: '복사용지' }],
      ),
      ...peopleRecent(
        [
          { employeeId: 'emp-kim', kind: 'hire', occurredAt: '2026-09-16' },
          { employeeId: 'emp-kim', kind: 'hire_badge', occurredAt: '2026-09-17' },
          { employeeId: 'emp-oh', kind: 'leave', occurredAt: '2026-09-19' },
        ],
        [
          { id: 'emp-kim', name: '김담당' },
          { id: 'emp-oh', name: '오세훈' },
        ],
      ),
      ...contractRecent([
        { id: 'con-1', title: '본사 3층 임대', createdAt: '2026-09-18T08:00:00.000Z' },
      ]),
      ...Array.from({ length: 8 }, (_, index) => ({
        id: `pad-${index}`,
        at: `2026-08-0${index + 1}T00:00:00.000Z`,
        label: '입고',
        detail: `볼펜 ${index}`,
        to: '/stock' as const,
      })),
    ])
    expect(rows.map((row) => [row.label, row.detail, row.to])).toEqual([
      ['반출', '복사용지 4', '/stock'],
      ['퇴사', '오세훈', '/people'],
      ['계약 초안', '본사 3층 임대', '/contracts'],
      ['입사', '김담당', '/people'],
      ['수령 입고', '복사용지 6', '/stock'],
      ['입고', '볼펜 7', '/stock'],
      ['입고', '볼펜 6', '/stock'],
      ['입고', '볼펜 5', '/stock'],
    ])
  })

  it('최소재고보다 적은 비품만 재고 부족이다', () => {
    expect(
      lowStock([
        { itemId: 'item-paper', itemName: '복사용지', onHand: 8, minStock: 10 },
        { itemId: 'item-pen', itemName: '볼펜', onHand: 1, minStock: 0 },
        { itemId: 'item-desk', itemName: '책상', onHand: 0, minStock: 2, managed: false },
        { itemId: 'item-clip', itemName: '클립', onHand: 20, minStock: 5 },
      ]).map((row) => [row.itemName, row.onHand, row.minStock]),
    ).toEqual([['복사용지', 8, 10]])
  })
})
