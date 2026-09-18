import QRCode from 'qrcode'

export function assetQrPayload(assetNo: string) {
  return `companyflow:asset:${assetNo}`
}

export function assetQrFileName(assetNo: string) {
  return `${assetNo}.png`
}

export async function assetQrDataUrl(assetNo: string) {
  return QRCode.toDataURL(assetQrPayload(assetNo), {
    width: 384,
    margin: 1,
    errorCorrectionLevel: 'M',
  })
}
