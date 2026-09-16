import { describe, expect, it } from 'vitest'
import { canStartRealData } from './durableStore'

describe('실데이터 시작 조건', () => {
  it('OPFS 파일이 열리면 Chrome persist() 거절만으로 막지 않는다', () => {
    expect(canStartRealData({ opfsOpen: true, persistGranted: false })).toBe(true)
  })

  it('OPFS가 없으면 사용 가능으로 올리지 않는다', () => {
    expect(canStartRealData({ opfsOpen: false, persistGranted: true })).toBe(false)
  })
})
