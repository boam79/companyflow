import { describe, expect, it } from 'vitest'
import { assertCompanyScopedPath, ProcessedOperations } from './idempotency'

describe('operation_id 중복 방지', () => {
  it('같은 operation_id는 작업을 한 번만 실행한다', () => {
    const ops = new ProcessedOperations()
    let calls = 0
    const first = ops.run('op-1', () => {
      calls += 1
      return { stock: 8 }
    })
    const second = ops.run('op-1', () => {
      calls += 1
      return { stock: 0 }
    })
    expect(calls).toBe(1)
    expect(first.status).toBe('applied')
    expect(second.status).toBe('duplicate')
    expect(second.value).toEqual({ stock: 8 })
  })
})

describe('회사별 저장 경로', () => {
  it('다른 회사 경로를 거부한다', () => {
    expect(
      assertCompanyScopedPath('aaa', 'opfs://companyflow/c/aaa/db.sqlite3'),
    ).toBe(true)
    expect(
      assertCompanyScopedPath('aaa', 'opfs://companyflow/c/bbb/db.sqlite3'),
    ).toBe(false)
  })
})
