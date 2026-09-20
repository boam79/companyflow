import { PURCHASE_KINDS } from '../master/commands'
import { executeStockCommand } from '../stock/persist'
import { MEMORY_VFS } from '../sqlite/openPlan'
import type { CompanySqlite } from '../sqlite/client'

export const GUEST_PAPER_QTY = 7
export const GUEST_PAPER_IN_OP = 'guest:paper-in'
export const GUEST_PAPER_ITEM_ID = 'item-paper'

export function assertGuestOpensMemory(guest: boolean, vfsName: string) {
  if (guest && vfsName !== MEMORY_VFS) {
    throw new Error('샘플은 메모리 DB만 엽니다. 지정 PC 원본은 열지 않습니다.')
  }
}

export async function seedGuestCompany(
  db: Pick<CompanySqlite, 'exec' | 'query' | 'batch'>,
): Promise<void> {
  const now = new Date().toISOString()
  await db.exec('insert or ignore into departments(id, name, created_at) values(?, ?, ?)', [
    'dept-guest-admin',
    '샘플총무',
    now,
  ])
  await db.exec('insert or ignore into departments(id, name, created_at) values(?, ?, ?)', [
    'dept-guest-sales',
    '샘플영업',
    now,
  ])
  await db.exec('insert or ignore into warehouses(id, name, created_at) values(?, ?, ?)', [
    'wh-main',
    '샘플창고',
    now,
  ])
  await db.exec('insert or ignore into warehouses(id, name, created_at) values(?, ?, ?)', [
    'wh-sub',
    '견본창고',
    now,
  ])
  for (const kind of PURCHASE_KINDS) {
    await db.exec('insert or ignore into purchase_kinds(id, name, created_at) values(?, ?, ?)', [
      kind.id,
      kind.label,
      now,
    ])
  }
  await db.exec(
    'insert or ignore into items(id, name, stock_managed, asset_managed, unit, code, created_at) values(?, ?, 1, 0, ?, ?, ?)',
    [GUEST_PAPER_ITEM_ID, '샘플 복사용지', '박스', 'DEMO-PAPER', now],
  )
  const assets = [
    { id: 'item-desk', name: '샘플 책상', code: 'DEMO-DESK' },
    { id: 'item-computer', name: '샘플 컴퓨터', code: 'DEMO-PC' },
  ]
  for (const item of assets) {
    await db.exec(
      'insert or ignore into items(id, name, stock_managed, asset_managed, unit, code, created_at) values(?, ?, 0, 1, ?, ?, ?)',
      [item.id, item.name, '대', item.code, now],
    )
  }
  await db.exec('insert or ignore into partners(id, name, created_at) values(?, ?, ?)', [
    'partner-guest',
    '견본문구',
    now,
  ])
  await db.exec(`update partners set phone = ?, memo = ? where id = ?`, [
    '02-000-0000',
    '샘플 공급사',
    'partner-guest',
  ])
  const employees = [
    {
      id: 'emp-guest-a',
      name: '견본 김대리',
      departmentId: 'dept-guest-admin',
      title: '대리',
      hiredAt: '2026-08-01',
      leftAt: null as string | null,
    },
    {
      id: 'emp-guest-b',
      name: '데모 이사원',
      departmentId: 'dept-guest-sales',
      title: '사원',
      hiredAt: '2026-09-01',
      leftAt: null,
    },
    {
      id: 'emp-guest-c',
      name: '견본 최과장',
      departmentId: 'dept-guest-sales',
      title: '과장',
      hiredAt: '2024-01-03',
      leftAt: '2026-07-31',
    },
  ]
  for (const employee of employees) {
    await db.exec(
      `insert or ignore into employees(id, name, department_id, title, hired_at, left_at, badge_name, badge_department, created_at)
        values(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        employee.id,
        employee.name,
        employee.departmentId,
        employee.title,
        employee.hiredAt,
        employee.leftAt,
        employee.name,
        employee.departmentId === 'dept-guest-admin' ? '샘플총무' : '샘플영업',
        now,
      ],
    )
  }
  await db.exec(
    `insert or ignore into employment_checks(employee_id, item_key, issued, issued_at, returned_at, updated_at)
      values(?, ?, 1, ?, null, ?)`,
    ['emp-guest-a', 'laptop', '2026-08-01', now],
  )
  await db.exec(
    `insert or ignore into assets(
      id, item_id, warehouse_id, status, employee_id, source_operation_id, created_at,
      qr_token, model, serial_no, location_text, department_name, owner_name, acquired_at
    ) values(?, ?, 'wh-main', 'in_storage', null, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'guest:desk-1',
      'item-desk',
      'guest:desk-1',
      now,
      'guest-qr:desk-1',
      '견본 책상',
      'DEMO-DSK-01',
      '샘플 1층 로비',
      '샘플총무',
      '견본 김대리',
      '2026-08-01',
    ],
  )
  await db.exec(
    `insert or ignore into assets(
      id, item_id, warehouse_id, status, employee_id, source_operation_id, created_at,
      qr_token, model, serial_no, location_text, department_name, owner_name, acquired_at
    ) values(?, ?, 'wh-main', 'in_storage', null, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'guest:pc-1',
      'item-computer',
      'guest:pc-1',
      now,
      'guest-qr:pc-1',
      '견본 노트북',
      'DEMO-PC-01',
      '샘플 1층 로비',
      '샘플영업',
      '데모 이사원',
      '2026-09-01',
    ],
  )
  await db.exec(
    `insert or ignore into contracts(
      id, title, contract_no, counterparty, signed_at, start_at, end_at, amount, currency,
      owner_name, status, ocr_status, created_at
    ) values(?, ?, ?, ?, ?, ?, ?, ?, 'KRW', ?, 'draft', 'off', ?)`,
    [
      'guest:con-1',
      '샘플 사무실 임대',
      'CON-DEMO-01',
      '견본임대',
      '2026-01-01',
      '2026-01-01',
      '2026-12-31',
      1_000_000,
      '견본 김대리',
      now,
    ],
  )
  await executeStockCommand(db, {
    type: 'post_direct_in',
    operationId: GUEST_PAPER_IN_OP,
    itemId: GUEST_PAPER_ITEM_ID,
    warehouseId: 'wh-main',
    qty: GUEST_PAPER_QTY,
  })
}
