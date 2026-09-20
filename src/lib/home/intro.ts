export const HOME_COVER_TITLE = '회사별 지정 PC 업무 원본'
export const HOME_COVER_LEAD = '입고, 반출, 재고현황을 이 PC에서 시작합니다.'
export const HOME_COVER_START = '업무 시작'
export const HOME_COVER_GUEST = '둘러보기'

export type HomeStoryTone = 'paper' | 'navy' | 'white'

export type HomeStoryBeat = {
  kicker: string
  title: string
  body: string
  tone: HomeStoryTone
}

export const HOME_STORY: HomeStoryBeat[] = [
  {
    kicker: '원본',
    title: '클라우드에 업무를 올리지 않습니다.',
    body: '지정한 이 PC 브라우저에 원본이 남습니다. 중앙은 로그인과 회사 등록만 맡습니다.',
    tone: 'paper',
  },
  {
    kicker: '매일',
    title: '입고하고, 반출하고, 재고를 봅니다.',
    body: '구매·재고의 앞면은 오늘 쓰는 입고·반출·재고현황입니다. 발주 두 단계는 접혀 있습니다.',
    tone: 'navy',
  },
  {
    kicker: '자산',
    title: '빈 QR을 붙이고, 자리의 물건을 남깁니다.',
    body: '책상·컴퓨터는 직원에게 배정하지 않습니다. 빈 QR로 위치를 넣고, 이 PC가 원본에 반영합니다.',
    tone: 'paper',
  },
  {
    kicker: '사람',
    title: '입사와 퇴사를 한 자리에서 끝냅니다.',
    body: '명찰·유니폼·노트북은 입퇴사 프로세스입니다. 회사 자산 목록과 섞지 않습니다.',
    tone: 'white',
  },
  {
    kicker: '계약',
    title: '계약서는 이 화면에서 읽고 남깁니다.',
    body: '원본 PDF·PNG·JPEG를 붙이면, 글자 후보는 이 PC에서만 읽습니다. 체결 전 초안입니다.',
    tone: 'navy',
  },
  {
    kicker: '회사',
    title: '회사마다 원본이 갈라집니다.',
    body: '한 회사 화면을 다른 회사에 복사하지 않습니다. 운영 권한은 계정 칸이 아니라 서버가 부여합니다.',
    tone: 'paper',
  },
]

export const HOME_STORY_CLOSE = '샘플로 먼저 만지거나, 지정 PC에서 업무를 시작합니다.'

export function homeStorySurface(tone: HomeStoryTone) {
  if (tone === 'navy') return 'bg-accent text-white'
  if (tone === 'white') return 'bg-card text-ink'
  return 'bg-paper text-ink'
}

export function homeStoryMuted(tone: HomeStoryTone) {
  return tone === 'navy' ? 'text-white/70' : 'text-muted'
}
