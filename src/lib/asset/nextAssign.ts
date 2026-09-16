import type { AssetRecord } from './book'
import type { EmployeeRecord } from '../people/employment'

export type NextAssign = {
  assetId: string
  employeeId: string
  employeeName: string
}

export function suggestNextAssign(
  assets: AssetRecord[],
  employees: EmployeeRecord[],
): NextAssign | null {
  const employee = employees.find((row) => !row.leftAt)
  const asset = assets.find((row) => row.status === 'in_storage')
  if (!employee || !asset) return null
  return { assetId: asset.id, employeeId: employee.id, employeeName: employee.name }
}

export function suggestNextReturn(assets: AssetRecord[]): { assetId: string } | null {
  const asset = assets.find((row) => row.status === 'assigned')
  return asset ? { assetId: asset.id } : null
}
