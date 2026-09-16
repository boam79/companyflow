export async function localDeviceFingerprint(): Promise<string> {
  const raw = [
    navigator.userAgent,
    String(screen.width),
    String(screen.height),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ].join('|')
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return Array.from(new Uint8Array(buf), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
