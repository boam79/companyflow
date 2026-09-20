import { normalizeHangulField } from '../asset/life'
import { ISSUE_ITEMS, type ItemRecord } from '../master/book'
import type { StockCommand } from './engine'

export const INBOUND_STOCK_ACTIONS: StockCommand['type'][] = [
  'draft_order',
  'confirm_order',
  'post_receipt',
  'post_direct_in',
]

export function isInboundStockAction(action: StockCommand['type']): boolean {
  return INBOUND_STOCK_ACTIONS.includes(action)
}

export function resolveTypedItem(
  items: ItemRecord[],
  typedName: string,
  options: { createIfMissing: boolean; newId: string },
): { item: ItemRecord; created: boolean } {
  const name = normalizeHangulField(typedName)
  if (!name) throw new Error('품목 이름을 입력하세요.')
  if (ISSUE_ITEMS.some((row) => row.name === name)) {
    throw new Error('명찰·유니폼·노트북은 입퇴사에서 지급합니다.')
  }
  const found = items.find((item) => normalizeHangulField(item.name) === name)
  if (found) return { item: found, created: false }
  if (!options.createIfMissing) {
    throw new Error('없는 품목입니다. 입고에서 이름을 치고 먼저 등록하세요.')
  }
  return {
    item: {
      id: options.newId,
      name,
      stockManaged: true,
      assetManaged: false,
    },
    created: true,
  }
}

export function supplyItemInsert(item: ItemRecord, createdAt: string): { sql: string; params: unknown[] } {
  return {
    sql: 'insert or ignore into items(id, name, stock_managed, asset_managed, created_at) values(?, ?, 1, 0, ?)',
    params: [item.id, item.name, createdAt],
  }
}
