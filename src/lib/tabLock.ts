const LOCK_PREFIX = 'companyflow-write:'
const held = new Map<string, { depth: number; release: () => void }>()

export async function acquireCompanyWriteLock(
  companyId: string,
): Promise<{ ok: true; release: () => void } | { ok: false }> {
  const lockName = `${LOCK_PREFIX}${companyId}`
  const existing = held.get(lockName)
  if (existing) {
    existing.depth += 1
    return {
      ok: true,
      release: () => releaseHeld(lockName),
    }
  }

  if (typeof navigator === 'undefined' || !navigator.locks) {
    held.set(lockName, { depth: 1, release: () => undefined })
    return { ok: true, release: () => releaseHeld(lockName) }
  }

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
          held.set(lockName, { depth: 1, release })
          resolve({
            ok: true,
            release: () => releaseHeld(lockName),
          })
        })
      },
    )
  })
}

function releaseHeld(lockName: string) {
  const existing = held.get(lockName)
  if (!existing) return
  existing.depth -= 1
  if (existing.depth > 0) return
  held.delete(lockName)
  existing.release()
}
