import { describe, expect, it } from 'vitest'
import { badgeFillValues, fallbackSlots, nameplateOverlay, slotsFromRuns } from './badgeFill'

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
})
