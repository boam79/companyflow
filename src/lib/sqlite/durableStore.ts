/** Chrome persist() 는 북마크·PWA 전에는 false인 경우가 많다. 실데이터의 기준은 OPFS 파일 개방이다. */
export function canStartRealData(flags: {
  opfsOpen: boolean
  persistGranted: boolean
}): boolean {
  return flags.opfsOpen
}
