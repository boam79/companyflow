import { Link } from 'react-router-dom'
import { missingRouteHomeHref, missingRouteHomeLabel, missingRouteLead } from '../lib/shell/missingRoute'

export function MissingRoutePage({ guest = false }: { guest?: boolean }) {
  return (
    <p className="text-sm">
      {missingRouteLead(guest)}{' '}
      <Link className="text-accent underline" to={missingRouteHomeHref(guest)}>
        {missingRouteHomeLabel(guest)}
      </Link>
    </p>
  )
}
