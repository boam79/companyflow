import type { AssetRecord } from './book'
import type { EmployeeRecord } from '../people/employment'

export type NextAssign = {
  assetId: string
  employeeId: string
  employeeName: string
}

export type NextAssetAction =
  | { kind: 'assign'; assetId: string; employeeId: string; employeeName: string; stored: number }
  | { kind: 'return'; assetId: string; employeeId: string; held: number }
  | { kind: 'rehire'; stored: number }

export function suggestNextAssign(
  assets: AssetRecord[],
  employees: EmployeeRecord[],
): NextAssign | null {
  const employee = employees.find((row) => !row.leftAt)
  const asset = assets.find((row) => row.status === 'in_storage')
  if (!employee || !asset) return null
  return { assetId: asset.id, employeeId: employee.id, employeeName: employee.name }
}

export function suggestNextReturn(assets: AssetRecord[]): { assetId: string; employeeId?: string } | null {
  const asset = assets.find((row) => row.status === 'assigned')
  return asset ? { assetId: asset.id, employeeId: asset.employeeId } : null
}

export function suggestNextAssetAction(
  assets: AssetRecord[],
  employees: EmployeeRecord[],
): NextAssetAction | null {
  const storedAssets = assets.filter((asset) => asset.status === 'in_storage')
  const assignedAssets = assets.filter((asset) => asset.status === 'assigned')
  const active = employees.find((row) => !row.leftAt)
  if (assignedAssets.length) {
    const asset = assignedAssets[0]
    return {
      kind: 'return',
      assetId: asset.id,
      employeeId: asset.employeeId ?? active?.id ?? '',
      held: assignedAssets.length,
    }
  }
  if (storedAssets.length && active) {
    return {
      kind: 'assign',
      assetId: storedAssets[0].id,
      employeeId: active.id,
      employeeName: active.name,
      stored: storedAssets.length,
    }
  }
  if (storedAssets.length && employees.length > 0 && employees.every((row) => row.leftAt)) {
    return { kind: 'rehire', stored: storedAssets.length }
  }
  return null
}
