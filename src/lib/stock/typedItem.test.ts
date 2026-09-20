import { describe, expect, it } from 'vitest'
import { COMPANY_ASSET_ITEMS, PAPER_ITEM } from '../master/book'
import { isInboundStockAction, resolveTypedItem } from './typedItem'

const ITEMS = [PAPER_ITEM, ...COMPANY_ASSET_ITEMS]

describe('입고 품목 직접 입력', () => {
  it('같은 이름이면 기존 복사용지를 쓰고 새로 만들지 않는다', () => {
    expect(resolveTypedItem(ITEMS, '  복사용지  ', { createIfMissing: true, newId: 'item-new' })).toEqual({
      item: PAPER_ITEM,
      created: false,
    })
  })

  it('없는 이름은 입고 때 비품으로 만든다', () => {
    const nfd = '볼펜'.normalize('NFD')
    const resolved = resolveTypedItem(ITEMS, ` ${nfd} `, { createIfMissing: true, newId: 'item-pen' })
    expect(resolved.created).toBe(true)
    expect(resolved.item).toMatchObject({
      id: 'item-pen',
      name: '볼펜',
      stockManaged: true,
      assetManaged: false,
    })
  })

  it('책상은 자산 품목으로 맞춘다', () => {
    const desk = COMPANY_ASSET_ITEMS.find((item) => item.id === 'item-desk')
    expect(resolveTypedItem(ITEMS, '책상', { createIfMissing: true, newId: 'item-x' })).toEqual({
      item: desk,
      created: false,
    })
  })

  it('반출은 없는 이름을 만들지 않는다', () => {
    expect(() => resolveTypedItem(ITEMS, '볼펜', { createIfMissing: false, newId: 'item-pen' })).toThrow(
      /입고에서 이름을 치고/,
    )
  })

  it('빈 이름과 명찰은 막는다', () => {
    expect(() => resolveTypedItem(ITEMS, '  ', { createIfMissing: true, newId: 'item-x' })).toThrow(/품목 이름/)
    expect(() => resolveTypedItem(ITEMS, '명찰', { createIfMissing: true, newId: 'item-x' })).toThrow(/입퇴사/)
  })

  it('직접 입고·수령·발주는 입고로 본다', () => {
    expect(isInboundStockAction('post_direct_in')).toBe(true)
    expect(isInboundStockAction('post_receipt')).toBe(true)
    expect(isInboundStockAction('confirm_order')).toBe(true)
    expect(isInboundStockAction('post_issue')).toBe(false)
  })
})
