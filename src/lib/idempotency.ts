export type ProcessResult = 'applied' | 'duplicate'

export class ProcessedOperations {
  private readonly results = new Map<string, unknown>()

  run<T>(operationId: string, work: () => T): { status: ProcessResult; value: T } {
    const existing = this.results.get(operationId)
    if (existing !== undefined) {
      return { status: 'duplicate', value: existing as T }
    }
    const value = work()
    this.results.set(operationId, value)
    return { status: 'applied', value }
  }
}

export function assertCompanyScopedPath(
  companyId: string,
  dbPath: string,
): boolean {
  return dbPath.includes(`/c/${companyId}/`) || dbPath.includes(`company_${companyId}`)
}
