import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { createWorker } from 'tesseract.js'
import { mimeFromName, sniffContractFileMime, toArrayBuffer } from './book'
import { DEFAULT_CONTRACT_MAX_PAGES, contractMaxPages } from './limits'
import { describeOcrResult, type OcrExtractResult } from './ocr'
import { parseContractDocument, type OcrPageText } from './parseFields'
import { pdfJsSafeSource } from './pdfjsSafe'

GlobalWorkerOptions.workerSrc = workerSrc

const MIN_PDF_TEXT = 40

let tessWorker: Awaited<ReturnType<typeof createWorker>> | null = null
let tessLoading: Promise<Awaited<ReturnType<typeof createWorker>>> | null = null

export async function textFromPdf(
  bytes: Uint8Array,
  maxPages = DEFAULT_CONTRACT_MAX_PAGES,
): Promise<{ text: string; pages: number; totalPages: number; pageTexts: OcrPageText[] }> {
  const task = getDocument(pdfJsSafeSource(toArrayBuffer(bytes)))
  try {
    const pdf = await task.promise
    const pageCount = Math.min(pdf.numPages, contractMaxPages(maxPages))
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
    return {
      text: chunks.join('\n'),
      pages: pageCount,
      totalPages: pdf.numPages,
      pageTexts: chunks.map((text, index) => ({ page: index + 1, text })),
    }
  } finally {
    await task.destroy()
  }
}

async function rasterPdfPages(bytes: Uint8Array, maxPages = DEFAULT_CONTRACT_MAX_PAGES): Promise<Blob[]> {
  if (typeof document === 'undefined') return []
  const task = getDocument(pdfJsSafeSource(toArrayBuffer(bytes)))
  try {
    const pdf = await task.promise
    const pageCount = Math.min(pdf.numPages, contractMaxPages(maxPages))
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
    }).catch((error) => {
      tessLoading = null
      tessWorker = null
      throw error
    })
  }
  tessWorker = await tessLoading
  return tessWorker
}

function imageBlob(bytes: Uint8Array, mime?: string) {
  return new Blob([toArrayBuffer(bytes)], mime ? { type: mime } : undefined)
}

async function decodeToBitmap(bytes: Uint8Array, mime: string): Promise<ImageBitmap> {
  if (typeof createImageBitmap === 'undefined') {
    throw new Error('이 브라우저에서는 그림을 열 수 없습니다.')
  }
  const types = [...new Set([mime, sniffContractFileMime(bytes), 'image/png', 'image/jpeg', 'image/webp', ''])]
  let lastError: unknown
  for (const type of types) {
    try {
      return await createImageBitmap(imageBlob(bytes, type || undefined))
    } catch (error) {
      lastError = error
    }
  }
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw lastError instanceof Error ? lastError : new Error('이 그림을 열 수 없습니다. PNG 또는 JPEG로 다시 저장해 보세요.')
  }
  const url = URL.createObjectURL(imageBlob(bytes, mime || sniffContractFileMime(bytes)))
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('이 그림을 열 수 없습니다. PNG 또는 JPEG로 다시 저장해 보세요.'))
      el.src = url
    })
    return await createImageBitmap(image)
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function rasterizeForOcr(bytes: Uint8Array, mime: string): Promise<Blob> {
  if (typeof document === 'undefined') return imageBlob(bytes, mime || 'image/png')
  const bitmap = await decodeToBitmap(bytes, mime)
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
  ctx.imageSmoothingEnabled = scale > 1
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
  return texts
}

export async function extractLocalContract(input: {
  bytes: Uint8Array
  fileName?: string
  fileMime?: string
  maxPages?: number
  onProgress?: (message: string) => void
}): Promise<OcrExtractResult> {
  const sniffed = sniffContractFileMime(input.bytes)
  const mime =
    sniffed ||
    (input.fileMime && input.fileMime !== 'application/octet-stream' ? input.fileMime : undefined) ||
    mimeFromName(input.fileName) ||
    ''
  const maxPages = contractMaxPages(input.maxPages)
  try {
    let text = ''
    let source: 'pdf-text' | 'ocr' = 'ocr'
    let pageTexts: OcrPageText[] = []
    let truncatedPages: number | undefined
    if (mime === 'application/pdf') {
      input.onProgress?.('PDF 글자를 읽는 중입니다.')
      const extracted = await textFromPdf(input.bytes, maxPages)
      text = extracted.text.trim()
      truncatedPages = extracted.totalPages > extracted.pages ? maxPages : undefined
      if (text.replace(/\s/g, '').length >= MIN_PDF_TEXT) {
        source = 'pdf-text'
        pageTexts = extracted.pageTexts
      } else {
        input.onProgress?.('스캔 페이지를 OCR하는 중입니다.')
        const images = await rasterPdfPages(input.bytes, maxPages)
        const texts = images.length ? await recognizeImages(images, input.onProgress) : []
        text = texts.join('\n') || text
        pageTexts = texts.map((pageText, index) => ({ page: index + 1, text: pageText }))
        source = 'ocr'
      }
    } else {
      input.onProgress?.('이미지에서 글자를 읽는 중입니다.')
      const original = imageBlob(input.bytes, mime === 'image/webp' ? 'image/webp' : mime || 'image/png')
      let usedRaster = false
      let texts: string[] = []
      try {
        texts = await recognizeImages([original], input.onProgress)
      } catch (error) {
        const failed = error instanceof Error ? error.message : String(error)
        if (!/attempting to read image|read image/i.test(failed)) throw error
        input.onProgress?.('그림을 바꿔서 다시 읽는 중입니다.')
        texts = await recognizeImages([await rasterizeForOcr(input.bytes, mime || 'image/png')], input.onProgress)
        usedRaster = true
      }
      text = texts.join('\n')
      if (!text.trim() && !usedRaster) {
        input.onProgress?.('그림을 키워서 다시 읽는 중입니다.')
        texts = await recognizeImages([await rasterizeForOcr(input.bytes, mime || 'image/png')], input.onProgress)
        text = texts.join('\n')
      }
      pageTexts = texts.map((pageText, index) => ({ page: index + 1, text: pageText }))
      source = 'ocr'
    }
    if (!pageTexts.length) pageTexts = [{ page: 1, text }]
    const candidates = parseContractDocument(pageTexts)
    return {
      status: text.trim() && candidates.length ? 'ready' : 'empty',
      candidates,
      text,
      message: describeOcrResult({ text, candidateCount: candidates.length, source, truncatedPages }),
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
