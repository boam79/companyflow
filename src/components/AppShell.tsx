import { Link, NavLink, Outlet } from 'react-router-dom'

const MENUS = [
  { to: '/', label: '홈' },
  { to: '/setup', label: '초기 설정' },
  { to: '/ops/companies', label: '회사 관리' },
]

export function AppShell() {
  return (
    <div className="min-h-svh">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-lg font-semibold text-accent">
            CompanyFlow
          </Link>
          <nav className="flex gap-4 text-sm">
            {MENUS.map((menu) => (
              <NavLink
                key={menu.to}
                to={menu.to}
                className={({ isActive }) =>
                  isActive ? 'font-semibold text-accent' : 'text-muted'
                }
              >
                {menu.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
