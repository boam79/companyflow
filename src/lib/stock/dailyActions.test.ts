import { describe, expect, it } from 'vitest'
import { DAILY_STOCK_ACTIONS, stockActionChoices } from './dailyActions'

describe('매일 재고 명령', () => {
  it('기본 명령은 입고·반출·반납이다', () => {
    expect(DAILY_STOCK_ACTIONS.map((row) => row.label)).toEqual(['입고', '반출', '반납'])
    expect(stockActionChoices(false, 'post_direct_in').map((row) => row.id)).toEqual([
      'post_direct_in',
      'post_issue',
      'post_return',
    ])
  })

  it('더 보기를 열면 발주·수령을 뒤에 붙인다', () => {
    const ids = stockActionChoices(true, 'post_direct_in').map((row) => row.id)
    expect(ids.slice(0, 3)).toEqual(['post_direct_in', 'post_issue', 'post_return'])
    expect(ids).toContain('confirm_order')
    expect(ids).toContain('post_receipt')
  })

  it('접혀 있어도 고른 발주 명령은 남긴다', () => {
    expect(stockActionChoices(false, 'post_receipt').map((row) => row.id)).toEqual([
      'post_direct_in',
      'post_issue',
      'post_return',
      'post_receipt',
    ])
  })
})
