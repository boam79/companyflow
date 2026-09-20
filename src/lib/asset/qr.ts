import QRCode from 'qrcode'

const LABEL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isQrLabelId(labelId: string) {
  return LABEL_ID.test(labelId.trim())
}

export function assertLabelId(labelId: string): string {
  const id = labelId.trim()
  if (!isQrLabelId(id)) throw new Error('빈 QR 표식이 올바르지 않습니다.')
  return id
}

export function assertBlankQrUrl(url: string) {
  if (/AST-/i.test(url) || /companyflow:asset/i.test(url)) {
    throw new Error('빈 QR은 자산번호를 넣지 않습니다.')
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('빈 QR 주소가 아닙니다.')
  }
  if (!/^\/q\/[0-9a-f-]{36}$/i.test(parsed.pathname)) {
    throw new Error('빈 QR 주소가 아닙니다.')
  }
  assertLabelId(parsed.pathname.slice(3))
}

export function blankQrScanUrl(origin: string, labelId: string) {
  const base = origin.replace(/\/$/, '')
  const url = `${base}/q/${assertLabelId(labelId)}`
  assertBlankQrUrl(url)
  return url
}

export function blankQrFileName(index: number) {
  if (!Number.isInteger(index) || index < 1) throw new Error('빈 QR 번호가 올바르지 않습니다.')
  return `빈QR-${String(index).padStart(2, '0')}.png`
}

export function assertBlankQrCount(count: number) {
  if (!Number.isInteger(count) || count < 1 || count > 40) {
    throw new Error('빈 QR은 1~40장까지 만듭니다.')
  }
  return count
}

export async function blankQrDataUrl(origin: string, labelId: string) {
  return QRCode.toDataURL(blankQrScanUrl(origin, labelId), {
    width: 384,
    margin: 1,
    errorCorrectionLevel: 'M',
  })
}
