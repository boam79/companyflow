export function assetsPageLead(guest: boolean) {
  if (guest) {
    return '샘플에서 빈 QR을 만들고 입력 열기로 자리의 물건 정보를 넣습니다. 지정 PC 원본과 중앙 QR은 쓰지 않습니다. 회사 자산은 자리에 두는 물건이며 직원에게 배정하지 않습니다.'
  }
  return '빈 QR을 자리의 물건에 붙인 뒤 스마트폰으로 위치와 품목을 넣습니다. 이 PC가 원본에 반영합니다. 직원에게 배정하지 않습니다.'
}

export function qrLoggedOutLead() {
  return '빈 QR을 읽었습니다. 로그인 후 자리의 물건 정보를 넣으세요.'
}

export function assetsPrintedQrLead(count: number, guest: boolean) {
  if (guest) {
    return `샘플 빈 QR ${count}장을 만들었습니다. 입력 열기를 눌러 이 화면에서 확인하세요. 지정 PC 원본은 건드리지 않습니다.`
  }
  return `빈 QR ${count}장을 만들었습니다. 인쇄해 자리의 물건에 붙인 뒤 스마트폰으로 읽으세요.`
}

export function assetsInboxHeading(guest: boolean, count: number) {
  if (guest) return '샘플 입력'
  return count ? `스마트폰에서 저장 ${count}` : '스마트폰에서 저장'
}

export function assetsListHeading(count: number) {
  return count ? `회사 자산 ${count}` : '회사 자산'
}

export function assetsEmptyLead() {
  return '회사 자산이 없습니다. 빈 QR을 붙인 뒤 스마트폰에서 정보를 넣으세요.'
}

export function qrEmptyCatalogLead() {
  return '자산 품목이 없습니다. 기준정보에서 자리의 물건을 추가하세요.'
}

export function assetsMissingQrHint(guest: boolean) {
  if (guest) return '빈 QR로 등록된 자산만 QR 상세를 엽니다. 견본으로 넣은 책상은 표식이 없습니다.'
  return '빈 QR로 등록된 자산만 QR 상세를 엽니다.'
}
