export function companyDbFileName(companyId: string): string {
  return `company_${companyId}.sqlite3`
}

export function companyFileDir(companyId: string): string {
  return `companyflow/c/${companyId}/files`
}

export function isSameCompanyContext(
  activeCompanyId: string | null,
  nextCompanyId: string,
): boolean {
  return activeCompanyId === nextCompanyId
}
