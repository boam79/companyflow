import { describe, expect, it } from 'vitest'
import { HOME_COVER_GUEST, HOME_COVER_LEAD, HOME_COVER_START, HOME_COVER_TITLE, HOME_SHORTCUTS } from './intro'

describe('홈 인트로', () => {
  it('남색 표지는 데이터 칸 없이 업무 시작만 둔다', () => {
    expect(HOME_COVER_TITLE).toBe('회사별 지정 PC 업무 원본')
    expect(HOME_COVER_LEAD).toContain('입고')
    expect(HOME_COVER_LEAD).toContain('반출')
    expect(HOME_COVER_START).toBe('업무 시작')
    expect(HOME_COVER_GUEST).toBe('둘러보기')
    expect(HOME_SHORTCUTS.map((item) => item.label)).toEqual([
      '기준정보',
      '구매·재고',
      '자산',
      '입퇴사',
      '계약',
      '회사 관리',
    ])
  })
})
