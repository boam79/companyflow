export function missingRouteLead(guest: boolean) {
  return guest ? '샘플에는 이 화면이 없습니다.' : '이 주소는 없습니다.'
}

export function missingRouteHomeHref(guest: boolean) {
  return guest ? '/guest' : '/'
}

export function missingRouteHomeLabel(guest: boolean) {
  return guest ? '샘플로' : '홈으로'
}
