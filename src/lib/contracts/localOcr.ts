import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { createWorker, PSM } from 'tesseract.js'
import { mimeFromName, toArrayBuffer } from './book'
import { describeOcrResult, type OcrExtractResult } from './ocr'
import { parseContractText } from './parseFields'

GlobalWorkerOptions.workerSrc = workerSrc

const MIN_PDF_TEXT = 40
const MAX_PAGES = 2

let tessWorker: Awaited<ReturnType<typeof createWorker>> | null = null
let tessLoading: Promise<Awaited<ReturnType<typeof createWorker>>> | null = null

export async function textFromPdf(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const task = getDocument({
    data: toArrayBuffer(bytes),
    useWasm: false,
    useWorkerFetch: false,
    disableAutoFetch: true,
  })
  try {
    const pdf = await task.promise
    const pageCount = Math.min(pdf.numPages, MAX_PAGES)
    const chunks: string[] = []
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      chunks.push(
        content.items
          .map((item) => ('str' in item ? String(item.str) : ''))
          .join(' '),
      )
    }
    return { text: chunks.join('\n'), pages: pageCount }
  } finally {
    await task.destroy()
  }
}

async function rasterPdfPages(bytes: Uint8Array): Promise<Blob[]> {
  if (typeof document === 'undefined') return []
  const task = getDocument({
    data: toArrayBuffer(bytes),
    useWasm: false,
    useWorkerFetch: false,
    disableAutoFetch: true,
  })
  try {
    const pdf = await task.promise
    const pageCount = Math.min(pdf.numPages, MAX_PAGES)
    const images: Blob[] = []
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 2 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      await page.render({ canvas, viewport }).promise
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (blob) images.push(blob)
    }
    return images
  } finally {
    await task.destroy()
  }
}

async function tessWorkerInstance(onProgress?: (message: string) => void) {
  if (tessWorker) return tessWorker
  if (!tessLoading) {
    tessLoading = createWorker(['kor', 'eng'], 1, {
      workerPath: '/tesseract-worker.min.js',
      corePath: '/tesseract-core',
      langPath: '/tessdata',
      gzip: true,
      workerBlobURL: true,
      logger: (info) => {
        if (!onProgress) return
        if (info.status === 'recognizing text' && typeof info.progress === 'number') {
          onProgress(`글자를 읽는 중 ${Math.round(info.progress * 100)}%`)
        } else if (info.status) {
          onProgress('OCR 엔진을 준비하는 중입니다. 처음이면 1분 정도 걸릴 수 있습니다.')
        }
      },
    })
      .then(async (worker) => {
        await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
        return worker
      })
      .catch((error) => {
        tessLoading = null
        tessWorker = null
        throw error
      })
  }
  tessWorker = await tessLoading
  return tessWorker
}

async function rasterizeForOcr(bytes: Uint8Array, mime: string): Promise<Blob> {
  const source = new Blob([toArrayBuffer(bytes)], { type: mime || 'image/png' })
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') return source
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(source)
  } catch {
    throw new Error('이 그림을 열 수 없습니다. PNG 또는 JPEG로 다시 저장해 보세요.')
  }
  const longest = Math.max(bitmap.width, bitmap.height, 1)
  let scale = 1
  if (longest < 1200) scale = 1200 / longest
  if (longest > 2400) scale = 2400 / longest
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) {
    bitmap.close()
    throw new Error('그림을 화면에 그릴 수 없습니다.')
  }
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('그림을 PNG로 바꿀 수 없습니다.')
  return blob
}

async function recognizeImages(images: Array<Blob | File>, onProgress?: (message: string) => void) {
  const worker = await tessWorkerInstance(onProgress)
  const texts: string[] = []
  for (const image of images) {
    const result = await worker.recognize(image)
    texts.push(result.data.text)
  }
  return texts.join('\n')
}

export async function extractLocalContract(input: {
  bytes: Uint8Array
  fileName?: string
  fileMime?: string
  onProgress?: (message: string) => void
}): Promise<OcrExtractResult> {
  const mime = (input.fileMime && input.fileMime !== 'application/octet-stream' ? input.fileMime : undefined)
    || mimeFromName(input.fileName)
    || ''
  try {
    let text = ''
    let source: 'pdf-text' | 'ocr' = 'ocr'
    if (mime === 'application/pdf') {
      input.onProgress?.('PDF 글자를 읽는 중입니다.')
      const extracted = await textFromPdf(input.bytes)
      text = extracted.text.trim()
      if (text.replace(/\s/g, '').length >= MIN_PDF_TEXT) {
        source = 'pdf-text'
      } else {
        input.onProgress?.('스캔 페이지를 OCR하는 중입니다.')
        const images = await rasterPdfPages(input.bytes)
        text = images.length ? await recognizeImages(images, input.onProgress) : text
        source = 'ocr'
      }
    } else {
      input.onProgress?.('이미지에서 글자를 읽는 중입니다.')
      const prepared = await rasterizeForOcr(input.bytes, mime || 'image/png')
      text = await recognizeImages([prepared], input.onProgress)
      source = 'ocr'
    }
    const candidates = parseContractText(text)
    return {
      status: text.trim() && candidates.length ? 'ready' : 'empty',
      candidates,
      text,
      message: describeOcrResult({ text, candidateCount: candidates.length, source }),
    }
  } catch (error) {
    return {
      status: 'empty',
      candidates: [],
      text: '',
      message: describeOcrResult({
        error: error instanceof Error ? error.message : String(error),
        text: '',
        candidateCount: 0,
      }),
    }
  }
}
