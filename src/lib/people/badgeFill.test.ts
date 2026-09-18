import { describe, expect, it } from 'vitest'
import {
  badgeFillValues,
  cssFontFromPdfName,
  fallbackSlots,
  matchTemplateSpacing,
  nameplateOverlay,
  overlayFromRuns,
  slotsFromRuns,
} from './badgeFill'

describe('명찰 채우기', () => {
  it('입사 칸 값으로 이름·부서·직위를 채운다', () => {
    expect(
      badgeFillValues({ name: '김담당', badgeName: '김 술 기', title: '주임' }, '디자인팀'),
    ).toEqual({
      name: '김 술 기',
      title: '주임',
      department: '디자인팀',
    })
  })

  it('템플릿의 이름 자리와 Title 라벨 옆에 칸을 둔다', () => {
    const slots = slotsFromRuns([
      { str: '김 술 기', x: 20, y: 40, width: 80, height: 18 },
      { str: 'Title', x: 120, y: 30, width: 30, height: 10 },
    ])
    expect(slots.find((slot) => slot.key === 'name')).toMatchObject({ x: 20, y: 40, width: 80 })
    expect(slots.find((slot) => slot.key === 'title')?.x).toBeGreaterThan(120)
  })

  it('라벨이 없으면 왼쪽 이름·오른쪽 직위 기본 칸을 쓴다', () => {
    const slots = fallbackSlots(240, 120)
    expect(slots.map((slot) => slot.key)).toEqual(['name', 'title', 'department'])
    expect(slots[0].x).toBeLessThan(slots[1].x)
  })

  it('화면 올리는 칸은 왼쪽 이름·오른쪽 직위·부서다', () => {
    const boxes = nameplateOverlay()
    expect(boxes.map((box) => box.key)).toEqual(['name', 'title', 'department'])
    expect(Number.parseFloat(boxes[0].left)).toBeLessThan(Number.parseFloat(boxes[1].left))
  })

  it('PDF 부분집합 폰트 이름을 나눔고딕 굵기로 바꾼다', () => {
    expect(cssFontFromPdfName('OLYHUB+NanumGothicBold')).toEqual({
      fontFamily: '"Nanum Gothic", "나눔고딕", sans-serif',
      fontWeight: 700,
    })
    expect(cssFontFromPdfName('EJAZKV+NanumGothic')).toEqual({
      fontFamily: '"Nanum Gothic", "나눔고딕", sans-serif',
      fontWeight: 400,
    })
  })

  it('템플릿 글자 크기와 굵기를 미리보기 칸에 옮긴다', () => {
    const boxes = overlayFromRuns(
      [
        {
          str: '김 슬 기',
          x: 20,
          y: 40,
          width: 80,
          height: 17,
          fontSize: 27,
          fontName: 'OLYHUB+NanumGothicBold',
        },
        {
          str: '주 임',
          x: 120,
          y: 30,
          width: 40,
          height: 10,
          fontSize: 16.5,
          fontName: 'EJAZKV+NanumGothic',
        },
        {
          str: '마 케 팅 팀',
          x: 120,
          y: 55,
          width: 50,
          height: 9,
          fontSize: 14.4,
          fontName: 'EJAZKV+NanumGothic',
        },
      ],
      240,
      120,
    )
    const name = boxes.find((box) => box.key === 'name')
    const title = boxes.find((box) => box.key === 'title')
    expect(name?.fontWeight).toBe(700)
    expect(name?.fontFamily).toContain('Nanum Gothic')
    expect(name?.fontSize).toBe('11.25cqw')
    expect(title?.fontWeight).toBe(400)
    expect(title?.fontSize).toBe('6.875cqw')
    expect(name?.sample).toBe('김 슬 기')
  })

  it('템플릿처럼 글자 사이를 띄운다', () => {
    expect(matchTemplateSpacing('박재민', '김 슬 기')).toBe('박 재 민')
    expect(matchTemplateSpacing('주임', '주 임')).toBe('주 임')
    expect(matchTemplateSpacing('마케팅팀', '이름')).toBe('마케팅팀')
  })

  it('부서 글자가 파일에 먼저 나와도 왼쪽 큰 글자를 이름으로 둔다', () => {
    const boxes = overlayFromRuns(
      [
        {
          str: '마 케 팅 팀',
          x: 176,
          y: 55,
          width: 38,
          height: 9,
          fontSize: 14.4,
          fontName: 'EJAZKV+NanumGothic',
        },
        {
          str: '주 임',
          x: 193,
          y: 30,
          width: 21,
          height: 10,
          fontSize: 16.5,
          fontName: 'EJAZKV+NanumGothic',
        },
        {
          str: '김 슬 기',
          x: 20,
          y: 40,
          width: 61,
          height: 17,
          fontSize: 27,
          fontName: 'OLYHUB+NanumGothicBold',
        },
        { str: 'Name', x: 10, y: 10, width: 20, height: 8, fontSize: 8 },
        { str: 'Title', x: 40, y: 10, width: 20, height: 8, fontSize: 8 },
      ],
      240,
      120,
    )
    const name = boxes.find((box) => box.key === 'name')
    const title = boxes.find((box) => box.key === 'title')
    const department = boxes.find((box) => box.key === 'department')
    expect(name?.sample).toBe('김 슬 기')
    expect(title?.sample).toBe('주 임')
    expect(department?.sample).toBe('마 케 팅 팀')
    expect(Number.parseFloat(name?.left || '99')).toBeLessThan(Number.parseFloat(department?.left || '0'))
  })
})
