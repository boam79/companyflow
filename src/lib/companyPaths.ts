const STORAGE_ID = /^[a-zA-Z0-9:_-]{1,80}$/

export function assertCompanyStorageId(companyId: string): string {
  const id = companyId.trim()
  if (!id || !STORAGE_ID.test(id)) {
    throw new Error('회사 표식이 올바르지 않습니다.')
  }
  return id
}

export function companyDbFileName(companyId: string): string {
  return `company_${assertCompanyStorageId(companyId)}.sqlite3`
}

export function companyFileDir(companyId: string): string {
  return `companyflow/c/${assertCompanyStorageId(companyId)}/files`
}

export function isSameCompanyContext(
  activeCompanyId: string | null,
  nextCompanyId: string,
): boolean {
  return activeCompanyId === nextCompanyId
}
