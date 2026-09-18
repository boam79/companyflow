import { describe, expect, it } from 'vitest'
import { contentBounds } from './badgePreviewCrop'

describe('명찰 미리보기 여백', () => {
  it('흰 여백을 빼고 내용 칸만 남긴다', () => {
    const width = 20
    const height = 16
    const pixels = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 255
      pixels[i + 1] = 255
      pixels[i + 2] = 255
      pixels[i + 3] = 255
    }
    for (let y = 6; y <= 9; y += 1) {
      for (let x = 8; x <= 12; x += 1) {
        const i = (y * width + x) * 4
        pixels[i] = 20
        pixels[i + 1] = 20
        pixels[i + 2] = 20
      }
    }
    expect(contentBounds(pixels, width, height, 1)).toEqual({ x: 7, y: 5, width: 7, height: 6 })
  })

  it('내용이 없으면 칸을 만들지 않는다', () => {
    expect(contentBounds(new Uint8ClampedArray(16), 2, 2, 1)).toBeUndefined()
  })
})
