import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import {
  SAMPLE_CONTRACT_DOCS,
  buildSampleContractPdf,
  sampleContractFileName,
  sampleContractPlainText,
  wrapPngAsPdf,
  type SampleContractDoc,
} from '../src/lib/contracts/sampleDocs'

const downloadsDir = join(homedir(), 'Downloads')

function fontPath() {
  return join(process.cwd(), 'public/fonts/NanumGothic-contract.ttf')
}

async function renderImages(docs: SampleContractDoc[], fontBytes: Uint8Array) {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const fontB64 = Buffer.from(fontBytes).toString('base64')
  const out = new Map<string, Uint8Array>()
  try {
    for (const doc of docs) {
      const mime = doc.kind === 'jpeg' ? 'image/jpeg' : 'image/png'
      const bytes = await page.evaluate(
        async ({ text, mime: imageMime, fontB64: b64 }) => {
          const face = new FontFace('NanumGothicContract', `url(data:font/ttf;base64,${b64})`)
          document.fonts.add(await face.load())
          await document.fonts.load('28px NanumGothicContract')
          const canvas = document.createElement('canvas')
          canvas.width = 1240
          canvas.height = 1754
          const ctx = canvas.getContext('2d')
          if (!ctx) throw new Error('그림을 만들 수 없습니다.')
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.fillStyle = '#111111'
          text.split('\n').forEach((line, index) => {
            ctx.font = index === 0 ? '700 40px NanumGothicContract' : '28px NanumGothicContract'
            ctx.fillText(line, 80, 140 + index * 64)
          })
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, imageMime, 0.92))
          if (!blob) throw new Error('샘플 그림을 만들지 못했습니다.')
          return Array.from(new Uint8Array(await blob.arrayBuffer()))
        },
        { text: sampleContractPlainText(doc), mime, fontB64 },
      )
      out.set(doc.contractNo, Uint8Array.from(bytes))
    }
  } finally {
    await browser.close()
  }
  return out
}

async function main() {
  const fontBytes = new Uint8Array(await readFile(fontPath()))
  const imageDocs = SAMPLE_CONTRACT_DOCS.filter((doc) => doc.kind !== 'pdf-text')
  const images = await renderImages(imageDocs, fontBytes)
  const written: string[] = []

  for (const doc of SAMPLE_CONTRACT_DOCS) {
    const name = sampleContractFileName(doc)
    const target = join(downloadsDir, name)
    let bytes: Uint8Array
    if (doc.kind === 'pdf-text') {
      bytes = await buildSampleContractPdf(doc, fontBytes)
    } else if (doc.kind === 'pdf-scan') {
      bytes = await wrapPngAsPdf(images.get(doc.contractNo)!)
    } else {
      bytes = images.get(doc.contractNo)!
    }
    await writeFile(target, bytes)
    written.push(`${target} (${bytes.byteLength} bytes)`)
  }

  for (const line of written) console.log(line)
}

await main()
