import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { isQrScanPath } from '../lib/asset/qr'
import { COMPANY_MODULES, loadCompanyModules } from '../lib/company/modules'
import { useCompanySession } from '../lib/companySession'
import { GUEST_MENUS, isGuestPath } from '../lib/guest/ids'
import { getCompanySqlite } from '../lib/sqlite/instance'
import { PendingInviteBanner } from './PendingInviteBanner'

const MENUS = [
  { to: '/', label: '홈' },
  { to: '/setup', label: '초기 설정' },
  { to: '/master', label: '기준정보' },
  { to: '/stock', label: '구매·재고' },
  { to: '/assets', label: '자산' },
  { to: '/people', label: '입퇴사' },
  { to: '/contracts', label: '계약' },
  { to: '/ops/companies', label: '회사 관리' },
  { to: '/settings', label: '회사 설정' },
  { to: '/data', label: '데이터 관리' },
]

export function AppShell() {
  const { loading, user, operator, signOut } = useAuth()
  const location = useLocation()
  const scanMode = isQrScanPath(location.pathname)
  const guest = isGuestPath(location.pathname)
  const home = location.pathname === '/'
  const { companyId } = useCompanySession(Boolean(user) && !guest)
  const [openCompanyId, setOpenCompanyId] = useState('')
  const [moduleTick, setModuleTick] = useState(0)
  const [moduleFlags, setModuleFlags] = useState<Record<string, boolean>>({})
  const menus = guest
    ? GUEST_MENUS
    : MENUS.filter((menu) => {
        const item = COMPANY_MODULES.find((module) => module.path === menu.to)
        if (!item) return true
        return moduleFlags[item.id] !== false
      })

  useEffect(() => {
    if (companyId) setOpenCompanyId(companyId)
  }, [companyId])

  useEffect(() => {
    function onOpen(event: Event) {
      const id = (event as CustomEvent<string>).detail
      if (id) setOpenCompanyId(id)
    }
    function onModules() {
      setModuleTick((value) => value + 1)
    }
    window.addEventListener('companyflow-open-company', onOpen)
    window.addEventListener('companyflow-modules', onModules)
    return () => {
      window.removeEventListener('companyflow-open-company', onOpen)
      window.removeEventListener('companyflow-modules', onModules)
    }
  }, [])

  useEffect(() => {
    if (guest || !user || !openCompanyId) return
    let cancelled = false
    void (async () => {
      const sqlite = getCompanySqlite()
      await sqlite.open(openCompanyId)
      const flags = await loadCompanyModules(sqlite)
      if (!cancelled) setModuleFlags(flags)
    })().catch(() => {
      if (!cancelled) setModuleFlags({})
    })
    return () => {
      cancelled = true
    }
  }, [guest, moduleTick, openCompanyId, user])

  return (
    <div className={`flex min-h-svh flex-col ${home ? 'bg-[#07090c]' : ''}`}>
      <header
        className={
          home
            ? 'sticky top-0 z-50 border-b border-white/10 bg-black/35 backdrop-blur-xl'
            : 'sticky top-0 z-50 border-b border-line/80 bg-card/80 backdrop-blur-xl'
        }
      >
        <div className="mx-auto flex w-full max-w-[92rem] items-center justify-between gap-4 px-5 py-2.5">
          <Link to="/" className={home ? 'text-[15px] font-semibold text-white' : 'text-lg font-semibold text-accent'}>
            CompanyFlow
          </Link>
          <nav className={`flex flex-wrap items-center gap-4 text-[13px] ${home ? '' : 'text-sm'}`}>
            {scanMode
              ? null
              : menus.map((menu) => (
                  <NavLink
                    key={menu.to}
                    to={menu.to}
                    className={({ isActive }) =>
                      home
                        ? isActive
                          ? 'font-medium text-white'
                          : 'text-white/50 hover:text-white/80'
                        : isActive
                          ? 'font-semibold text-accent'
                          : 'text-muted'
                    }
                    end={menu.to === '/' || menu.to === '/guest'}
                  >
                    {menu.label}
                  </NavLink>
                ))}
            {loading ? null : user ? (
              <>
                <span className={home ? 'text-white/45' : 'text-muted'}>{user.email}</span>
                {operator ? (
                  <span className="rounded bg-accent-soft px-2 py-0.5 text-xs">운영</span>
                ) : null}
                <button type="button" className={home ? 'text-white/45' : 'text-muted'} onClick={() => void signOut()}>
                  로그아웃
                </button>
              </>
            ) : guest ? null : (
              <NavLink
                to={scanMode ? `/login?next=${encodeURIComponent(location.pathname)}` : '/login'}
                className={({ isActive }) =>
                  home
                    ? isActive
                      ? 'font-medium text-white'
                      : 'text-white/50 hover:text-white/80'
                    : isActive
                      ? 'font-semibold text-accent'
                      : 'text-muted'
                }
              >
                로그인
              </NavLink>
            )}
          </nav>
        </div>
      </header>
      <main
        className={
          scanMode || location.pathname !== '/'
            ? 'mx-auto w-full max-w-[92rem] flex-1 px-5 py-4'
            : 'w-full flex-1 bg-[#07090c]'
        }
      >
        {scanMode || guest || !user ? null : <PendingInviteBanner />}
        <Outlet />
      </main>
    </div>
  )
}
