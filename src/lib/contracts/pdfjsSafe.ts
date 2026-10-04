export const PDFJS_SAFE_OPTIONS = {
  enableScripting: false,
  isEvalSupported: false,
  useWasm: false,
  useWorkerFetch: false,
  disableAutoFetch: true,
} as const

export function pdfJsSafeSource(data: ArrayBuffer) {
  return { data, ...PDFJS_SAFE_OPTIONS }
}
