import { describe, expect, it } from 'vitest'
import { contractWatchLabel, waitingReceipts, watchContracts } from './work'

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
})
