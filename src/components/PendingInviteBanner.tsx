import { usePendingInvites } from '../lib/pendingInvites'
import { useAuth } from '../lib/AuthContext'
import { inviteRoleLabel } from '../lib/invite'

export function PendingInviteBanner() {
  const { user } = useAuth()
  const { rows, message, accept } = usePendingInvites(Boolean(user))

  if (!user || rows.length === 0) return null

  return (
    <div className="mx-auto w-full max-w-[92rem] px-5 pt-4 text-ink">
      <div className="rounded border border-line bg-card px-4 py-3 text-sm">
        {rows.map((row) => (
          <div key={row.id} className="flex flex-wrap items-center justify-between gap-3">
            <p>
              <strong>{row.display_name}</strong> 초대가 있습니다. 수락하면 {inviteRoleLabel(row.role)}로
              연결됩니다.
            </p>
            <button
              type="button"
              className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-white"
              onClick={() => void accept(row.id)}
            >
              수락
            </button>
          </div>
        ))}
        {message ? <p className="mt-2 text-muted">{message}</p> : null}
      </div>
    </div>
  )
}
