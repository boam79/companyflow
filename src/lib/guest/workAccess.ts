import { useLocation } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { useCompanySession } from '../companySession'
import { getCompanySqlite, getGuestSqlite } from '../sqlite/instance'
import { GUEST_COMPANY, GUEST_COMPANY_ID, isGuestPath, workPath } from './ids'

export function useWorkAccess() {
  const location = useLocation()
  const guest = isGuestPath(location.pathname)
  const { loading, configured, user } = useAuth()
  const sqlite = guest ? getGuestSqlite() : getCompanySqlite()
  const session = useCompanySession(Boolean(user) && !guest)

  return {
    guest,
    sqlite,
    loading: guest ? false : loading,
    configured,
    user,
    companies: guest ? [GUEST_COMPANY] : session.companies,
    companyId: guest ? GUEST_COMPANY_ID : session.companyId,
    setCompanyId: guest ? () => undefined : session.setCompanyId,
    href: (path: string) => workPath(path, guest),
  }
}
