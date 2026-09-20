import { PDFDocument, rgb } from 'pdf-lib'
import { SAMPLE_CONTRACTS } from '../master/sample'
import { toArrayBuffer } from './book'

export type SampleContractKind = 'pdf-text' | 'png' | 'jpeg' | 'pdf-scan'

export type SampleContractDoc = {
  title: string
  contractNo: string
  counterparty: string
  signedAt: string
  startAt: string
  endAt: string
  amount: number
  ownerName: string
  heading: string
  kind: SampleContractKind
}

const HEADINGS = ['임대차 계약서', '유지보수 계약서', '회선 계약서', '보험 계약서'] as const
const KINDS: SampleContractKind[] = ['pdf-text', 'png', 'jpeg', 'pdf-scan']

export const SAMPLE_CONTRACT_DOCS: SampleContractDoc[] = SAMPLE_CONTRACTS.map((row, index) => ({
  title: row.title,
  contractNo: `CON-SAMPLE-0${index + 1}`,
  counterparty: row.counterparty,
  signedAt: row.signedAt,
  startAt: row.startAt,
  endAt: row.endAt,
  amount: row.amount,
  ownerName: row.ownerName,
  heading: HEADINGS[index],
  kind: KINDS[index],
}))

function koDate(iso: string) {
  const [year, month, day] = iso.split('-')
  return `${year}년 ${Number(month)}월 ${Number(day)}일`
}

export function sampleContractExt(kind: SampleContractKind) {
  if (kind === 'png') return 'png'
  if (kind === 'jpeg') return 'jpg'
  return 'pdf'
}

export function sampleContractMime(kind: SampleContractKind) {
  if (kind === 'png') return 'image/png'
  if (kind === 'jpeg') return 'image/jpeg'
  return 'application/pdf'
}

export function sampleContractFileName(doc: SampleContractDoc) {
  return `샘플-${doc.title.replace(/\s+/g, '')}.${sampleContractExt(doc.kind)}`
}

export function sampleContractPlainText(doc: SampleContractDoc) {
  return [
    doc.heading,
    `계약명 ${doc.title}`,
    `계약번호 ${doc.contractNo}`,
    `상대방 ${doc.counterparty}`,
    `담당자 ${doc.ownerName}`,
    `체결일 ${koDate(doc.signedAt)}`,
    `시작일 ${koDate(doc.startAt)}`,
    `종료일 ${koDate(doc.endAt)}`,
    `계약금액 ${doc.amount.toLocaleString('ko-KR')}원`,
    '본 계약은 샘플이며 서명·체결 효력이 없습니다.',
  ].join('\n')
}

async function loadSampleContractFont(fontBytes?: Uint8Array) {
  if (fontBytes) return fontBytes
  const response = await fetch('/fonts/NanumGothic-contract.ttf')
  if (!response.ok) throw new Error('샘플 글꼴을 불러오지 못했습니다.')
  return new Uint8Array(await response.arrayBuffer())
}

export async function buildSampleContractPdf(doc: SampleContractDoc, fontBytes?: Uint8Array) {
  const pdf = await PDFDocument.create()
  const fontkit = (await import('@pdf-lib/fontkit')).default
  pdf.registerFontkit(fontkit)
  const page = pdf.addPage([595.28, 841.89])
  const font = await pdf.embedFont(await loadSampleContractFont(fontBytes))
  let y = 760
  for (const [index, line] of sampleContractPlainText(doc).split('\n').entries()) {
    const size = index === 0 ? 20 : 13
    page.drawText(line, { x: 56, y, size, font, color: rgb(0.1, 0.1, 0.12) })
    y -= index === 0 ? 36 : 26
  }
  return pdf.save()
}

async function wrapPngAsPdf(png: Uint8Array) {
  const pdf = await PDFDocument.create()
  const image = await pdf.embedPng(png)
  const width = 595.28
  const height = 841.89
  const page = pdf.addPage([width, height])
  const margin = 36
  const maxW = width - margin * 2
  const maxH = height - margin * 2
  const scale = Math.min(maxW / image.width, maxH / image.height)
  const drawW = image.width * scale
  const drawH = image.height * scale
  page.drawImage(image, {
    x: (width - drawW) / 2,
    y: (height - drawH) / 2,
    width: drawW,
    height: drawH,
  })
  return pdf.save()
}

async function ensureSampleCanvasFont() {
  const face = new FontFace('NanumGothicContract', 'url(/fonts/NanumGothic-contract.ttf)')
  document.fonts.add(await face.load())
  await document.fonts.load('28px NanumGothicContract')
}

export async function renderSampleContractImage(doc: SampleContractDoc, mime: 'image/png' | 'image/jpeg') {
  if (typeof document === 'undefined') {
    throw new Error('샘플 그림은 브라우저에서 만듭니다.')
  }
  await document.fonts.ready
  await ensureSampleCanvasFont()
  const canvas = document.createElement('canvas')
  canvas.width = 1240
  canvas.height = 1754
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('그림을 만들 수 없습니다.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#111111'
  sampleContractPlainText(doc)
    .split('\n')
    .forEach((line, index) => {
      ctx.font =
        index === 0
          ? '700 40px NanumGothicContract, "Nanum Gothic", sans-serif'
          : '28px NanumGothicContract, "Nanum Gothic", sans-serif'
      ctx.fillText(line, 80, 140 + index * 64)
    })
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.92))
  if (!blob) throw new Error('샘플 그림을 만들지 못했습니다.')
  return blob
}

export async function buildSampleContractFile(doc: SampleContractDoc, fontBytes?: Uint8Array) {
  if (doc.kind === 'pdf-text') {
    const bytes = await buildSampleContractPdf(doc, fontBytes)
    return new File([toArrayBuffer(bytes)], sampleContractFileName(doc), { type: 'application/pdf' })
  }
  const image = await renderSampleContractImage(doc, doc.kind === 'jpeg' ? 'image/jpeg' : 'image/png')
  if (doc.kind === 'pdf-scan') {
    const png = new Uint8Array(await image.arrayBuffer())
    const bytes = await wrapPngAsPdf(png)
    return new File([toArrayBuffer(bytes)], sampleContractFileName(doc), { type: 'application/pdf' })
  }
  return new File([image], sampleContractFileName(doc), { type: sampleContractMime(doc.kind) })
}

export function downloadSampleContractFile(file: File) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  URL.revokeObjectURL(url)
}
