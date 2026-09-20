export function isImeComposing(event: {
  isComposing?: boolean
  keyCode?: number
  nativeEvent?: { isComposing?: boolean; keyCode?: number }
}) {
  if (event.isComposing || event.nativeEvent?.isComposing) return true
  const code = event.keyCode ?? event.nativeEvent?.keyCode
  return code === 229
}

export function preventImeEnterSubmit(event: {
  key?: string
  isComposing?: boolean
  keyCode?: number
  nativeEvent?: { isComposing?: boolean; keyCode?: number }
  preventDefault: () => void
}) {
  if (event.key !== 'Enter') return false
  if (!isImeComposing(event)) return false
  event.preventDefault()
  return true
}
