import { PDFDocument } from 'pdf-lib'
import type { BadgeFillValues } from './badgeFill'

export const NAMEPLATE_PRINT_SCALE = 300 / 72

export function nameplatePageSizePts(
  cropPx: { width: number; height: number },
  renderScale: number,
): { width: number; height: number } {
  if (!(renderScale > 0)) return { width: cropPx.width, height: cropPx.height }
  return {
    width: cropPx.width / renderScale,
    height: cropPx.height / renderScale,
  }
}

export function ptsToMm(pt: number) {
  return (pt / 72) * 25.4
}

export function filledBadgeFileName(values: BadgeFillValues) {
  const name = (values.name || '명찰').replace(/\s+/g, '')
  return `명찰-${name}.pdf`
}

export async function wrapImageAsNameplatePdf(png: Uint8Array, widthPt: number, heightPt: number) {
  const pdf = await PDFDocument.create()
  const image = await pdf.embedPng(png)
  const page = pdf.addPage([widthPt, heightPt])
  page.drawImage(image, { x: 0, y: 0, width: widthPt, height: heightPt })
  return pdf.save()
}

export async function buildFilledBadgePdf(bytes: Uint8Array, values: BadgeFillValues) {
  const { renderFilledNameplate } = await import('./badgePreview')
  const rendered = await renderFilledNameplate(bytes, values)
  const size = nameplatePageSizePts(
    { width: rendered.widthPx, height: rendered.heightPx },
    rendered.scale,
  )
  const pdf = await wrapImageAsNameplatePdf(rendered.png, size.width, size.height)
  return {
    pdf,
    widthPt: size.width,
    heightPt: size.height,
    fileName: filledBadgeFileName(values),
  }
}
