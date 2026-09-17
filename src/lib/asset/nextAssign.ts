import type { AssetRecord } from './book'
import type { EmployeeRecord } from '../people/employment'
import { ISSUE_ITEMS, type ItemRecord } from '../master/book'

export type NextAssign = {
  assetId: string
  employeeId: string
  employeeName: string
}

export type NextAssetAction =
  | {
      kind: 'issue'
      itemId: string
      itemName: string
      employeeId: string
      employeeName: string
    }
  | {
      kind: 'assign'
      assetId: string
      itemName: string
      employeeId: string
      employeeName: string
      stored: number
    }
  | { kind: 'return'; assetId: string; employeeId: string; held: number }
  | { kind: 'rehire'; stored: number }

export function issueItemIds(items: ItemRecord[]): Set<string> {
  return new Set(items.filter((item) => item.assetManaged).map((item) => item.id))
}

export function issuedAssets(assets: AssetRecord[], items: ItemRecord[]): AssetRecord[] {
  const ids = issueItemIds(items)
  return assets.filter((asset) => ids.has(asset.itemId))
}

export function suggestNextAssign(
  assets: AssetRecord[],
  employees: EmployeeRecord[],
  items: ItemRecord[] = ISSUE_ITEMS,
): NextAssign | null {
  const employee = employees.find((row) => !row.leftAt)
  const asset = issuedAssets(assets, items).find((row) => row.status === 'in_storage')
  if (!employee || !asset) return null
  return { assetId: asset.id, employeeId: employee.id, employeeName: employee.name }
}

export function suggestNextReturn(
  assets: AssetRecord[],
  items: ItemRecord[] = ISSUE_ITEMS,
): { assetId: string; employeeId?: string } | null {
  const asset = issuedAssets(assets, items).find((row) => row.status === 'assigned')
  return asset ? { assetId: asset.id, employeeId: asset.employeeId } : null
}

export function missingIssueItem(
  assets: AssetRecord[],
  employeeId: string,
  items: ItemRecord[] = ISSUE_ITEMS,
): ItemRecord | null {
  const held = new Set(
    assets
      .filter((asset) => asset.status === 'assigned' && asset.employeeId === employeeId)
      .map((asset) => asset.itemId),
  )
  return ISSUE_ITEMS.filter((item) => items.some((row) => row.id === item.id)).find(
    (item) => !held.has(item.id),
  ) ?? null
}

export type IssueCheckRow = {
  itemId: string
  itemName: string
  held?: AssetRecord
  stored?: AssetRecord
}

export function issueChecklist(
  assets: AssetRecord[],
  employeeId: string,
  catalog: ItemRecord[] = ISSUE_ITEMS,
): IssueCheckRow[] {
  return catalog.map((item) => ({
    itemId: item.id,
    itemName: item.name,
    held: assets.find(
      (asset) =>
        asset.itemId === item.id && asset.status === 'assigned' && asset.employeeId === employeeId,
    ),
    stored: assets.find((asset) => asset.itemId === item.id && asset.status === 'in_storage'),
  }))
}

export function suggestNextAssetAction(
  assets: AssetRecord[],
  employees: EmployeeRecord[],
  items: ItemRecord[] = ISSUE_ITEMS,
): NextAssetAction | null {
  const active = employees.find((row) => !row.leftAt)
  const issued = issuedAssets(assets, items)
  if (active) {
    const missing = missingIssueItem(assets, active.id, items)
    if (missing) {
      const stored = issued.filter((asset) => asset.status === 'in_storage' && asset.itemId === missing.id)
      if (stored[0]) {
        return {
          kind: 'assign',
          assetId: stored[0].id,
          itemName: missing.name,
          employeeId: active.id,
          employeeName: active.name,
          stored: stored.length,
        }
      }
      return {
        kind: 'issue',
        itemId: missing.id,
        itemName: missing.name,
        employeeId: active.id,
        employeeName: active.name,
      }
    }
  }
  const assigned = issued.filter((asset) => asset.status === 'assigned')
  if (assigned.length) {
    return {
      kind: 'return',
      assetId: assigned[0].id,
      employeeId: assigned[0].employeeId ?? active?.id ?? '',
      held: assigned.length,
    }
  }
  const stored = issued.filter((asset) => asset.status === 'in_storage')
  if (stored.length && employees.length > 0 && employees.every((row) => row.leftAt)) {
    return { kind: 'rehire', stored: stored.length }
  }
  return null
}
