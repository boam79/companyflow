export type CropRect = { x: number; y: number; width: number; height: number }

function isInk(r: number, g: number, b: number, a: number) {
  if (a < 16) return false
  return r < 248 || g < 248 || b < 248
}

export function contentBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  padding = 12,
): CropRect | undefined {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      if (!isInk(pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3])) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return undefined
  const x = Math.max(0, minX - padding)
  const y = Math.max(0, minY - padding)
  const right = Math.min(width, maxX + 1 + padding)
  const bottom = Math.min(height, maxY + 1 + padding)
  return { x, y, width: right - x, height: bottom - y }
}

export function cropCanvasToContent(canvas: HTMLCanvasElement, padding = 12): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const bounds = contentBounds(image.data, image.width, image.height, padding)
  if (!bounds) return canvas
  if (bounds.width >= canvas.width - 2 && bounds.height >= canvas.height - 2) return canvas
  const cropped = document.createElement('canvas')
  cropped.width = bounds.width
  cropped.height = bounds.height
  const next = cropped.getContext('2d')
  if (!next) return canvas
  next.drawImage(
    canvas,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    bounds.width,
    bounds.height,
  )
  return cropped
}
