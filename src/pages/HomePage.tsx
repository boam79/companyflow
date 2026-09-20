import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import {
  HOME_COVER_GUEST,
  HOME_COVER_LEAD,
  HOME_COVER_START,
  HOME_COVER_TITLE,
  HOME_SHORTCUTS,
} from '../lib/home/intro'

export function HomePage() {
  const { user } = useAuth()
  const startTo = user ? '/stock' : '/login'

  return (
    <div className="flex min-h-full flex-col">
      <section className="bg-accent px-5 py-16 text-white md:py-24">
        <div className="mx-auto max-w-[92rem]">
          <p className="text-3xl font-semibold tracking-tight md:text-5xl">CompanyFlow</p>
          <h1 className="mt-3 max-w-4xl text-3xl font-semibold leading-tight md:text-5xl">{HOME_COVER_TITLE}</h1>
          <p className="mt-5 max-w-2xl text-base text-white/80 md:text-lg">{HOME_COVER_LEAD}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {user ? (
              <Link to={startTo} className="inline-flex rounded bg-white px-5 py-2.5 text-sm font-semibold text-accent">
                {HOME_COVER_START}
              </Link>
            ) : (
              <>
                <Link to="/guest" className="inline-flex rounded bg-white px-5 py-2.5 text-sm font-semibold text-accent">
                  {HOME_COVER_GUEST}
                </Link>
                <Link
                  to="/login"
                  className="inline-flex rounded border border-white/40 px-5 py-2.5 text-sm font-semibold text-white"
                >
                  로그인
                </Link>
              </>
            )}
          </div>
        </div>
      </section>
      <nav className="border-b border-line bg-paper px-5 py-8">
        <ul className="mx-auto flex max-w-[92rem] flex-wrap items-center justify-center text-sm text-muted">
          {HOME_SHORTCUTS.map((item, index) => (
            <li key={item.to} className="flex items-center">
              {index > 0 ? (
                <span className="mx-4 text-line" aria-hidden="true">
                  |
                </span>
              ) : null}
              <Link className="py-1 hover:text-ink" to={item.to}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
