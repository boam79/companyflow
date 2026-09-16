import { describe, expect, it } from 'vitest'
import { acquireCompanyWriteLock } from './tabLock'

describe('원본 탭 잠금', () => {
  it('같은 탭에서 두 번 잡아도 안쪽이 바깥을 풀지 않는다', async () => {
    const outer = await acquireCompanyWriteLock('co-1')
    expect(outer.ok).toBe(true)
    if (!outer.ok) return
    const inner = await acquireCompanyWriteLock('co-1')
    expect(inner.ok).toBe(true)
    if (!inner.ok) return
    inner.release()
    const still = await acquireCompanyWriteLock('co-1')
    expect(still.ok).toBe(true)
    if (still.ok) still.release()
    outer.release()
  })
})
