import { PAPER_ITEM, writeDefaultMaster } from '../master/book'
import { executeStockCommand } from '../stock/persist'
import type { CompanySqlite } from '../sqlite/client'

export const GUEST_PAPER_QTY = 20
export const GUEST_PAPER_IN_OP = 'guest:paper-in'

export async function seedGuestCompany(
  db: Pick<CompanySqlite, 'exec' | 'query' | 'batch'>,
): Promise<void> {
  await writeDefaultMaster(db)
  await executeStockCommand(db, {
    type: 'post_direct_in',
    operationId: GUEST_PAPER_IN_OP,
    itemId: PAPER_ITEM.id,
    warehouseId: 'wh-main',
    qty: GUEST_PAPER_QTY,
  })
}
