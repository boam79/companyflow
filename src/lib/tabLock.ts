const LOCK_PREFIX = 'companyflow-write:'

export async function acquireCompanyWriteLock(
  companyId: string,
): Promise<{ ok: true; release: () => void } | { ok: false }> {
  if (typeof navigator === 'undefined' || !navigator.locks) {
    return { ok: true, release: () => undefined }
  }

  const lockName = `${LOCK_PREFIX}${companyId}`

  return new Promise((resolve) => {
    void navigator.locks.request(
      lockName,
      { ifAvailable: true, mode: 'exclusive' },
      async (lock) => {
        if (!lock) {
          resolve({ ok: false })
          return
        }
        await new Promise<void>((release) => {
          resolve({
            ok: true,
            release,
          })
        })
      },
    )
  })
}
