import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { createWorker } from 'tesseract.js'
import { mimeFromName, toArrayBuffer } from './book'
import { parseContractText } from './parseFields'
import type { OcrExtractResult } from './ocr'

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
          onProgress('OCR 엔진을 준비하는 중입니다.')
        }
      },
    })
  }
  tessWorker = await tessLoading
  return tessWorker
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
      const blob = new Blob([toArrayBuffer(input.bytes)], { type: mime || 'image/png' })
      text = await recognizeImages([blob], input.onProgress)
      source = 'ocr'
    }
    const candidates = parseContractText(text)
    if (!text.trim()) {
      return {
        status: 'empty',
        candidates: [],
        text: '',
        message: '글자를 찾지 못했습니다. 직접 입력하세요. 원본은 이 PC에 남습니다.',
      }
    }
    return {
      status: 'ready',
      candidates,
      text,
      message:
        source === 'pdf-text'
          ? 'PDF 글자로 후보를 채웠습니다. 확인하고 고친 뒤 초안을 저장하세요. OCR만으로 체결하지 않습니다.'
          : '이 PC에서 OCR로 후보를 채웠습니다. 확인하고 고친 뒤 초안을 저장하세요. OCR만으로 체결하지 않습니다.',
    }
  } catch (error) {
    return {
      status: 'empty',
      candidates: [],
      text: '',
      message: `OCR을 끝내지 못했습니다. 직접 입력하세요. (${error instanceof Error ? error.message : String(error)})`,
    }
  }
}
