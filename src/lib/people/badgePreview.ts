import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { toArrayBuffer } from '../contracts/book'
import { previewableBadgePdfBytes } from './badgeTemplate'

GlobalWorkerOptions.workerSrc = workerSrc

export async function renderBadgeTemplatePreview(bytes: Uint8Array): Promise<string[]> {
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
    const images: string[] = []
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1.6 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      await page.render({ canvas, viewport }).promise
      images.push(canvas.toDataURL('image/png'))
    }
    return images
  } catch {
    return []
  } finally {
    await task.destroy()
  }
}
