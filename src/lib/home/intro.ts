export const HOME_COVER_TITLE = '회사별 지정 PC\n업무 원본'
export const HOME_COVER_LEAD = '입고, 반출, 재고현황을 이 PC에서 시작합니다.'
export const HOME_COVER_START = '업무 시작'
export const HOME_COVER_GUEST = '둘러보기'

export type HomeStoryTone = 'paper' | 'navy' | 'white'

export type HomeStoryBeat = {
  kicker: string
  title: string
  body: string
  tone: HomeStoryTone
  image: string
  imageAlt: string
}

export const HOME_STORY: HomeStoryBeat[] = [
  {
    kicker: '원본',
    title: '클라우드에 업무를\n올리지 않습니다.',
    body: '지정한 이 PC 브라우저에 원본이 남습니다. 중앙은 로그인과 회사 등록만 맡습니다.',
    tone: 'paper',
    image: '/home/origin.jpg',
    imageAlt: '지정 PC 모니터와 책상',
  },
  {
    kicker: '매일',
    title: '입고하고, 반출하고,\n재고를 봅니다.',
    body: '구매·재고의 앞면은 오늘 쓰는 입고·반출·재고현황입니다. 발주 두 단계는 접혀 있습니다.',
    tone: 'navy',
    image: '/home/stock.jpg',
    imageAlt: '복사용지와 입고 선반',
  },
  {
    kicker: '자산',
    title: '빈 QR을 붙이고,\n자리의 물건을 남깁니다.',
    body: '책상·컴퓨터는 직원에게 배정하지 않습니다. 빈 QR로 위치를 넣고, 이 PC가 원본에 반영합니다.',
    tone: 'paper',
    image: '/home/assets.jpg',
    imageAlt: '책상에 붙인 빈 QR',
  },
  {
    kicker: '사람',
    title: '입사와 퇴사를\n한 자리에서 끝냅니다.',
    body: '명찰·유니폼·노트북은 입퇴사 프로세스입니다. 회사 자산 목록과 섞지 않습니다.',
    tone: 'white',
    image: '/home/people.jpg',
    imageAlt: '명찰과 유니폼',
  },
  {
    kicker: '계약',
    title: '계약서는 이 화면에서\n읽고 남깁니다.',
    body: '원본 PDF·PNG·JPEG를 붙이면, 글자 후보는 이 PC에서만 읽습니다. 체결 전 초안입니다.',
    tone: 'navy',
    image: '/home/contracts.jpg',
    imageAlt: '책상 위의 계약서',
  },
  {
    kicker: '회사',
    title: '회사마다\n원본이 갈라집니다.',
    body: '한 회사 화면을 다른 회사에 복사하지 않습니다. 운영 권한은 계정 칸이 아니라 서버가 부여합니다.',
    tone: 'paper',
    image: '/home/company.jpg',
    imageAlt: '서로 다른 회사 건물',
  },
]

export const HOME_STORY_CLOSE = '지정한 이 PC가 원본입니다.'
export const HOME_STORY_CLOSE_IMAGE = '/home/close.jpg'
export const HOME_STORY_CLOSE_ALT = '지정 PC 자리'

export function homeStorySurface(tone: HomeStoryTone) {
  if (tone === 'navy') return 'bg-accent text-white'
  if (tone === 'white') return 'bg-white text-ink'
  return 'bg-[#f5f5f7] text-ink'
}

export function homeStoryMuted(tone: HomeStoryTone) {
  return tone === 'navy' ? 'text-white/70' : 'text-[#6e6e73]'
}
