export function isSahHandleBusy(message: string): boolean {
  return /Access Handles cannot be created|another open Access Handle/i.test(message)
}

export function explainSqliteOpenError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (isSahHandleBusy(message)) {
    return '다른 탭이나 화면이 이미 원본 DB를 열고 있습니다. CompanyFlow 창을 하나만 남기고 새로고침하세요.'
  }
  return message
}
