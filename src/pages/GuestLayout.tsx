import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { isQrScanPath } from '../lib/asset/qr'
import { GUEST_COMPANY_ID } from '../lib/guest/ids'
import { assertGuestOpensMemory, seedGuestCompany } from '../lib/guest/seed'
import { publicErrorMessage } from '../lib/publicError'
import { getGuestSqlite } from '../lib/sqlite/instance'

export function GuestLayout() {
  const scanMode = isQrScanPath(useLocation().pathname)
  const [ready, setReady] = useState(() => getGuestSqlite().isOpen(GUEST_COMPANY_ID))
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const db = getGuestSqlite()
        await db.open(GUEST_COMPANY_ID, { memory: true })
        assertGuestOpensMemory(true, db.vfsName)
        await seedGuestCompany(db)
        if (!cancelled) {
          setMessage('')
          setReady(true)
        }
      } catch (error) {
        if (!cancelled) setMessage(publicErrorMessage(error))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex flex-col gap-4">
      {scanMode ? null : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-line bg-card px-4 py-3 text-sm">
          <p>
            <strong>샘플입니다.</strong> 견본 김대리처럼 가짜 이름만 있습니다. 새로고침하면 처음부터이고, 지정 PC 원본은 건드리지 않습니다.
          </p>
          <Link className="shrink-0 text-accent underline" to="/">
            샘플 끝내기
          </Link>
        </div>
      )}
      {message ? <p className="text-sm text-danger">{message}</p> : null}
      {ready ? <Outlet /> : <p className="text-sm text-muted">샘플을 준비하는 중입니다.</p>}
    </div>
  )
}
