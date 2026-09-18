import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { toArrayBuffer } from '../contracts/book'
import { previewableBadgePdfBytes } from './badgeTemplate'
import { cropCanvasToContent } from './badgePreviewCrop'
import { slotsForPage, nameplateOverlay, overlayPaintFromRuns, matchTemplateSpacing, type BadgeFillValues, type BadgeSlot, type OverlayBox, type OverlayPaint, type TextRun } from './badgeFill'

GlobalWorkerOptions.workerSrc = workerSrc

export type BadgePreviewPage = { image: string; slots: BadgeSlot[]; overlay: OverlayBox[] }

function isPdfTextItem(
  item: unknown,
): item is { str: string; transform: number[]; width?: number; fontName?: string } {
  if (!item || typeof item !== 'object') return false
  const row = item as { str?: unknown; transform?: unknown }
  return typeof row.str === 'string' && Array.isArray(row.transform)
}

function resolvePdfFontName(page: { commonObjs?: { get: (id: string) => unknown } }, fontId?: string) {
  if (!fontId) return ''
  try {
    const font = page.commonObjs?.get(fontId)
    if (font && typeof font === 'object' && 'name' in font && typeof font.name === 'string') {
      return font.name
    }
  } catch {
    return fontId
  }
  return fontId
}

function runsFromPage(
  items: unknown[],
  viewport: { convertToViewportPoint: (x: number, y: number) => number[]; scale: number },
  crop: { x: number; y: number },
  page: { commonObjs?: { get: (id: string) => unknown } },
): TextRun[] {
  const runs: TextRun[] = []
  for (const item of items) {
    if (!isPdfTextItem(item) || !item.str.trim()) continue
    const matrix = item.transform
    const fontSize = Math.hypot(matrix[2], matrix[3]) * viewport.scale
    const [x, yTop] = viewport.convertToViewportPoint(matrix[4], matrix[5])
    const [, yBottom] = viewport.convertToViewportPoint(matrix[4], matrix[5] + Math.hypot(matrix[2], matrix[3]))
    const y = Math.min(yTop, yBottom)
    const height = Math.max(Math.abs(yBottom - yTop), fontSize)
    const width = Math.max((item.width ?? 0) * viewport.scale, item.str.length * height * 0.5)
    runs.push({
      str: item.str,
      x: x - crop.x,
      y: y - crop.y,
      width,
      height,
      fontSize,
      fontName: resolvePdfFontName(page, item.fontName),
    })
  }
  return runs
}

export async function renderBadgeTemplatePreview(bytes: Uint8Array): Promise<BadgePreviewPage[]> {
  const pdfBytes = previewableBadgePdfBytes(bytes)
  if (!pdfBytes || typeof document === 'undefined') return []
  const task = getDocument({
    data: toArrayBuffer(pdfBytes),
    useWasm: false,
    useWorkerFetch: false,
    disableAutoFetch: true,
  })
  try {
    const pdf = await task.promise
    const pageCount = Math.min(pdf.numPages, 2)
    const pages: BadgePreviewPage[] = []
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1.6 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      await page.render({ canvas, viewport }).promise
      const cropped = cropCanvasToContent(canvas)
      const text = await page.getTextContent()
      const runs = runsFromPage(text.items, viewport, cropped.bounds, page)
      pages.push({
        image: cropped.canvas.toDataURL('image/png'),
        slots: slotsForPage(runs, cropped.canvas.width, cropped.canvas.height),
        overlay: nameplateOverlay(runs, cropped.canvas.width, cropped.canvas.height),
      })
    }
    return pages
  } catch {
    return []
  } finally {
    await task.destroy()
  }
}

export async function paintFilledBadge(
  src: string,
  slots: BadgeSlot[],
  values: BadgeFillValues,
): Promise<string> {
  if (typeof document === 'undefined') return src
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('미리보기 그림을 열 수 없습니다.'))
    img.src = src
  })
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return src
  ctx.drawImage(image, 0, 0)
  ctx.textBaseline = 'top'
  for (const slot of slots) {
    const text = values[slot.key as keyof BadgeFillValues]?.trim()
    if (!text) continue
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(slot.x - 1, slot.y - 1, slot.width + 2, slot.height + 2)
    ctx.fillStyle = '#171717'
    ctx.font = `600 ${Math.max(11, Math.round(slot.fontSize))}px sans-serif`
    ctx.fillText(text, slot.x, slot.y + Math.max(0, (slot.height - slot.fontSize) / 5), slot.width)
  }
  return canvas.toDataURL('image/png')
}

async function canvasPngBytes(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((next) => {
      if (next) resolve(next)
      else reject(new Error('명찰 그림을 만들지 못했습니다.'))
    }, 'image/png')
  })
  return new Uint8Array(await blob.arrayBuffer())
}

async function ensureOverlayFonts(paints: OverlayPaint[]) {
  if (typeof document === 'undefined' || !document.fonts?.load) return
  await Promise.all(
    paints.map((paint) =>
      document.fonts.load(`${paint.fontWeight} ${Math.ceil(paint.fontSize)}px ${paint.fontFamily}`),
    ),
  )
}

function paintOverlay(canvas: HTMLCanvasElement, paints: OverlayPaint[], values: BadgeFillValues) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.textBaseline = 'middle'
  for (const paint of paints) {
    const text = values[paint.key]?.trim()
    if (!text) continue
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(paint.x, paint.y, paint.width, paint.height)
    ctx.fillStyle = '#111111'
    ctx.font = `${paint.fontWeight} ${paint.fontSize}px ${paint.fontFamily}`
    ctx.textAlign = paint.textAlign === 'left' ? 'left' : 'center'
    const x = paint.textAlign === 'left' ? paint.x + 1 : paint.x + paint.width / 2
    ctx.fillText(matchTemplateSpacing(text, paint.sample), x, paint.y + paint.height / 2)
  }
}

export async function renderFilledNameplate(bytes: Uint8Array, values: BadgeFillValues) {
  const pdfBytes = previewableBadgePdfBytes(bytes)
  if (!pdfBytes || typeof document === 'undefined') {
    throw new Error('명찰 템플릿 미리보기를 그릴 수 없습니다.')
  }
  const scale = 300 / 72
  const task = getDocument({
    data: toArrayBuffer(pdfBytes),
    useWasm: false,
    useWorkerFetch: false,
    disableAutoFetch: true,
  })
  try {
    const pdf = await task.promise
    const page = await pdf.getPage(1)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    await page.render({ canvas, viewport }).promise
    const cropped = cropCanvasToContent(canvas, Math.max(8, Math.round(scale * 4)))
    const text = await page.getTextContent()
    const runs = runsFromPage(text.items, viewport, cropped.bounds, page)
    const paints = overlayPaintFromRuns(runs)
    if (!paints.length) throw new Error('명찰에서 이름·직위·부서 칸을 찾지 못했습니다.')
    await ensureOverlayFonts(paints)
    paintOverlay(cropped.canvas, paints, values)
    return {
      png: await canvasPngBytes(cropped.canvas),
      widthPx: cropped.canvas.width,
      heightPx: cropped.canvas.height,
      scale,
    }
  } finally {
    await task.destroy()
  }
}
