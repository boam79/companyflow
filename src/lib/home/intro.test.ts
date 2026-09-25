import { describe, expect, it } from 'vitest'
import {
  HOME_COVER_GUEST,
  HOME_COVER_IMAGE,
  HOME_COVER_LEAD,
  HOME_COVER_START,
  HOME_COVER_TITLE,
  HOME_COVER_WAIT,
  HOME_COVER_WAIT_LEAD,
  HOME_STORY,
  HOME_STORY_CLOSE,
  homeStoryMuted,
  homeStorySurface,
} from './intro'

describe('홈 인트로', () => {
  it('남색 표지는 데이터 칸 없이 업무 시작만 둔다', () => {
    expect(HOME_COVER_TITLE.replaceAll('\n', ' ')).toBe('회사별 지정 PC 업무 원본')
    expect(HOME_COVER_LEAD).toContain('입고')
    expect(HOME_COVER_LEAD).toContain('반출')
    expect(HOME_COVER_START).toBe('업무 시작')
    expect(HOME_COVER_GUEST).toBe('둘러보기')
    expect(HOME_COVER_GUEST).not.toMatch(/로그인/)
    expect(HOME_COVER_WAIT).toBe('연결된 회사가 없습니다')
    expect(HOME_COVER_WAIT_LEAD).toContain('이 화면에서 수락')
    expect(HOME_COVER_WAIT_LEAD).not.toMatch(/업무 시작/)
  })

  it('하단 메뉴 대신 스크롤 설명으로 사이트 전체를 말한다', () => {
    expect(HOME_STORY.map((beat) => beat.kicker)).toEqual(['원본', '매일', '자산', '사람', '계약', '회사'])
    expect(HOME_STORY.some((beat) => /입고/.test(beat.title) && /반출/.test(beat.title))).toBe(true)
    expect(HOME_STORY.some((beat) => /QR/.test(beat.title))).toBe(true)
    expect(HOME_STORY.some((beat) => /입사/.test(beat.title))).toBe(true)
    expect(HOME_STORY.some((beat) => /계약/.test(beat.title))).toBe(true)
    expect(HOME_STORY_CLOSE).toBe('지정한 이 PC가 원본입니다.')
    expect(HOME_STORY_CLOSE).not.toMatch(/샘플/)
    expect(HOME_STORY.every((beat) => beat.image.startsWith('/home/'))).toBe(true)
    expect(HOME_STORY.every((beat) => !/복사용지/.test(beat.imageAlt))).toBe(true)
    expect(HOME_STORY.every((beat) => !/운영 권한/.test(beat.body))).toBe(true)
    expect(HOME_COVER_IMAGE).toBe('/home/origin.jpg')
    expect(homeStorySurface('navy')).toContain('bg-accent')
    expect(homeStoryMuted('paper')).toBe('text-[#6e6e73]')
  })
})
