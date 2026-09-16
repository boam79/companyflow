import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

type StoreStatus = {
  persisted: boolean | null
  quota: string
}

export function HomePage() {
  const { configured, user, operator } = useAuth()
  const [store, setStore] = useState<StoreStatus>({
    persisted: null,
    quota: '확인 전',
  })

  useEffect(() => {
    let cancelled = false
    async function inspect() {
      if (!navigator.storage?.estimate || !navigator.storage?.persisted) {
        if (!cancelled) {
          setStore({ persisted: false, quota: '이 브라우저는 OPFS 확인을 지원하지 않습니다.' })
        }
        return
      }
      const persisted = await navigator.storage.persisted()
      const estimate = await navigator.storage.estimate()
      if (cancelled) return
      const used = estimate.usage ?? 0
      const quota = estimate.quota ?? 0
      setStore({
        persisted,
        quota: `사용 ${Math.round(used / 1024)}KB / 할당 ${Math.round(quota / 1024 / 1024)}MB`,
      })
    }
    void inspect()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm text-muted">지정 PC 로컬 원본 · 한글 업무 화면</p>
        <h1 className="mt-1 text-3xl font-semibold">홈</h1>
        <p className="mt-3 max-w-2xl text-muted">
          결재 대기, 수령 대기, 재고 부족, 계약 만료는 단계 3 이후 연결됩니다. 지금은 지정 PC
          원본에서 기준정보와 복사용지 재고 거래를 등록합니다.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <StatusCard
          title="중앙 운영"
          value={configured ? '환경 변수 연결됨' : '미연결'}
          detail={
            configured
              ? 'Supabase Auth·회사 등록을 사용할 수 있습니다.'
              : 'VITE_SUPABASE_URL / ANON_KEY가 없습니다. 로컬 미리보기만 가능합니다.'
          }
        />
        <StatusCard
          title="이 기기 저장"
          value={
            store.persisted === null
              ? '확인 중'
              : store.persisted
                ? '영속 저장 가능'
                : '영속 저장 미확인'
          }
          detail={store.quota}
        />
        <StatusCard
          title="로그인"
          value={user ? (operator ? '운영 관리자' : user.email ?? '로그인됨') : '로그아웃'}
          detail="권한은 user_metadata가 아니라 app_metadata만 봅니다."
        />
      </section>

      <section className="rounded-lg border border-line bg-card p-6">
        <h2 className="text-lg font-semibold">다음 작업</h2>
        <ul className="mt-4 space-y-2 text-sm">
          <li>
            <Link className="text-accent underline" to="/login">
              로그인 / 회원가입
            </Link>
          </li>
          <li>
            <Link className="text-accent underline" to="/ops/companies">
              운영 관리자: 새 회사 등록
            </Link>
          </li>
          <li>
            <Link className="text-accent underline" to="/setup">
              회사 관리자: 이 PC를 업무 원본 장치로 설정
            </Link>
          </li>
          <li>
            <Link className="text-accent underline" to="/master">
              기준정보: 부서·직원·품목·거래처·창고
            </Link>
          </li>
          <li>
            <Link className="text-accent underline" to="/stock">
              구매·재고: 발주·수령·반출·이동
            </Link>
          </li>
          <li>
            <Link className="text-accent underline" to="/assets">
              자산: 재고 자산화 목록
            </Link>
          </li>
        </ul>
      </section>
    </div>
  )
}

function StatusCard(props: { title: string; value: string; detail: string }) {
  return (
    <article className="rounded-lg border border-line bg-card p-5 text-left">
      <h2 className="text-sm text-muted">{props.title}</h2>
      <p className="mt-2 text-xl font-semibold">{props.value}</p>
      <p className="mt-2 text-sm text-muted">{props.detail}</p>
    </article>
  )
}
