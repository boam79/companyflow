import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'

const MENUS = [
  { to: '/', label: '홈' },
  { to: '/setup', label: '초기 설정' },
  { to: '/master', label: '기준정보' },
  { to: '/stock', label: '구매·재고' },
  { to: '/assets', label: '자산' },
  { to: '/people', label: '입퇴사' },
  { to: '/contracts', label: '계약' },
  { to: '/ops/companies', label: '회사 관리' },
]

export function AppShell() {
  const { loading, user, operator, signOut } = useAuth()
  const location = useLocation()
  const scanMode = location.pathname.startsWith('/q/')

  return (
    <div className="flex min-h-svh flex-col">
      <header className="shrink-0 border-b border-line bg-card">
        <div className="mx-auto flex w-full max-w-[92rem] items-center justify-between gap-4 px-5 py-2.5">
          <Link to="/" className="text-lg font-semibold text-accent">
            CompanyFlow
          </Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm">
            {scanMode
              ? null
              : MENUS.map((menu) => (
                  <NavLink
                    key={menu.to}
                    to={menu.to}
                    className={({ isActive }) =>
                      isActive ? 'font-semibold text-accent' : 'text-muted'
                    }
                    end={menu.to === '/'}
                  >
                    {menu.label}
                  </NavLink>
                ))}
            {loading ? null : user ? (
              <>
                <span className="text-muted">{user.email}</span>
                {operator ? (
                  <span className="rounded bg-accent-soft px-2 py-0.5 text-xs">운영</span>
                ) : null}
                <button type="button" className="text-muted" onClick={() => void signOut()}>
                  로그아웃
                </button>
              </>
            ) : (
              <NavLink
                to={scanMode ? `/login?next=${location.pathname}` : '/login'}
                className={({ isActive }) =>
                  isActive ? 'font-semibold text-accent' : 'text-muted'
                }
              >
                로그인
              </NavLink>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[92rem] flex-1 px-5 py-4">
        <Outlet />
      </main>
    </div>
  )
}
