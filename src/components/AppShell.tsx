import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { isQrScanPath } from '../lib/asset/qr'
import { APP_MENUS, hasWorkCompany, visibleShellMenus } from '../lib/company/nav'
import { readCompanyModules } from '../lib/company/moduleAccess'
import { allowedOpenedCompanyId, useCompanySession } from '../lib/companySession'
import { GUEST_MENUS, isGuestPath } from '../lib/guest/ids'
import { getCompanySqlite } from '../lib/sqlite/instance'
import { PendingInviteBanner } from './PendingInviteBanner'

export function AppShell() {
  const { loading, user, operator, signOut } = useAuth()
  const location = useLocation()
  const scanMode = isQrScanPath(location.pathname)
  const guest = isGuestPath(location.pathname)
  const home = location.pathname === '/'
  const { companyId, ready, companies } = useCompanySession(Boolean(user) && !guest, user?.id ?? '')
  const hasCompany = hasWorkCompany(ready, companyId)
  const companiesRef = useRef(companies)
  companiesRef.current = companies
  const [openCompanyId, setOpenCompanyId] = useState('')
  const [moduleTick, setModuleTick] = useState(0)
  const [moduleFlags, setModuleFlags] = useState<Record<string, boolean>>({})
  const menus = guest
    ? GUEST_MENUS
    : visibleShellMenus(APP_MENUS, {
        signedIn: Boolean(user),
        operator,
        hasCompany,
        moduleFlags,
      })

  useEffect(() => {
    setOpenCompanyId(hasCompany ? companyId : '')
  }, [companyId, hasCompany])

  useEffect(() => {
    function onOpen(event: Event) {
      const allowed = allowedOpenedCompanyId((event as CustomEvent<string>).detail, companiesRef.current)
      if (allowed) setOpenCompanyId(allowed)
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
    if (!allowedOpenedCompanyId(openCompanyId, companies)) return
    let cancelled = false
    void (async () => {
      const sqlite = getCompanySqlite()
      await sqlite.open(openCompanyId)
      const flags = await readCompanyModules(sqlite, openCompanyId)
      if (!cancelled) setModuleFlags(flags)
    })().catch(() => {
      if (!cancelled) setModuleFlags({})
    })
    return () => {
      cancelled = true
    }
  }, [companies, guest, moduleTick, openCompanyId, user])

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
