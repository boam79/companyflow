import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import {
  HOME_COVER_GUEST,
  HOME_COVER_IMAGE,
  HOME_COVER_IMAGE_ALT,
  HOME_COVER_LEAD,
  HOME_COVER_START,
  HOME_COVER_TITLE,
  HOME_STORY,
  HOME_STORY_CLOSE,
  HOME_STORY_CLOSE_ALT,
  HOME_STORY_CLOSE_IMAGE,
} from '../lib/home/intro'

const titleClass =
  'whitespace-pre-line break-keep text-[2.125rem] font-semibold leading-[1.12] md:text-[3rem] md:leading-[1.08] lg:text-[3.5rem] lg:leading-[1.06]'
const bodyClass = 'mt-5 max-w-[24rem] whitespace-pre-line text-[16px] font-normal leading-[1.5] text-white/60'

function Cta({
  to,
  children,
  ghost,
}: {
  to: string
  children: ReactNode
  ghost?: boolean
}) {
  return (
    <Link
      to={to}
      className={
        ghost
          ? 'inline-flex h-10 items-center rounded-full border border-white/18 px-5 text-[14px] font-medium text-white/90 transition hover:bg-white/8'
          : 'inline-flex h-10 items-center rounded-full bg-white px-5 text-[14px] font-medium text-[#111] transition hover:bg-white/90'
      }
    >
      {children}
    </Link>
  )
}

function Kicker({ index, label }: { index: string; label: string }) {
  return (
    <p className="flex items-center gap-3 text-[13px] font-medium text-white/70">
      <span className="tabular-nums text-white/40">{index}</span>
      <span className="h-px w-7 bg-white/25" />
      {label}
    </p>
  )
}

function Film({
  image,
  imageAlt,
  eager,
  tall,
  children,
}: {
  image: string
  imageAlt: string
  eager?: boolean
  tall?: boolean
  children: ReactNode
}) {
  return (
    <section className={`relative bg-[#07090c] ${tall ? 'min-h-[165svh]' : ''}`}>
      <div
        className={
          tall
            ? 'sticky top-14 min-h-[calc(100svh-3.5rem)] overflow-hidden'
            : 'relative min-h-[calc(100svh-3.5rem)] overflow-hidden'
        }
      >
        <img
          src={image}
          alt={imageAlt}
          className="home-film-img absolute inset-0 h-full w-full object-cover"
          width={1376}
          height={768}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={eager ? 'high' : 'low'}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/82 via-black/48 to-black/18" />
        <div className="home-grain" />
        <div className="relative z-10 flex min-h-[calc(100svh-3.5rem)] items-center px-6 py-16 md:px-10 lg:px-16">
          <div className="max-w-[34rem]">{children}</div>
        </div>
      </div>
    </section>
  )
}

export function HomePage() {
  const { user } = useAuth()
  const startTo = user ? '/stock' : '/login'

  return (
    <div className="flex min-h-full flex-col bg-[#07090c] text-white antialiased">
      <section className="relative min-h-[calc(100svh-3.5rem)] overflow-hidden bg-[#07090c]">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[58%] lg:block">
          <img
            src={HOME_COVER_IMAGE}
            alt={HOME_COVER_IMAGE_ALT}
            className="home-film-img h-full w-full object-cover"
            width={1376}
            height={768}
            fetchPriority="high"
            decoding="async"
            style={{
              maskImage: 'linear-gradient(to right, transparent 0%, black 32%)',
              WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 32%)',
            }}
          />
        </div>
        <div className="relative h-[42vh] overflow-hidden lg:hidden">
          <img
            src={HOME_COVER_IMAGE}
            alt=""
            className="h-full w-full object-cover"
            width={1376}
            height={768}
            fetchPriority="high"
            decoding="async"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-[#07090c]" />
        </div>
        <div className="home-grain" />
        <div className="relative z-10 mx-auto flex min-h-[calc(58svh-3.5rem)] w-full max-w-[90rem] items-center px-6 py-16 md:px-10 lg:min-h-[calc(100svh-3.5rem)] lg:px-16">
          <div className="max-w-[34rem]">
            <p className="text-[13px] font-medium text-white/50">CompanyFlow</p>
            <h1 className={`${titleClass} mt-4`}>{HOME_COVER_TITLE}</h1>
            <p className={bodyClass}>{HOME_COVER_LEAD}</p>
            <div className="mt-8 flex flex-wrap gap-2.5">
              {user ? (
                <Cta to={startTo}>{HOME_COVER_START}</Cta>
              ) : (
                <>
                  <Cta to="/guest">{HOME_COVER_GUEST}</Cta>
                  <Cta to="/login" ghost>
                    로그인
                  </Cta>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
      {HOME_STORY.map((beat, index) => (
        <Film
          key={beat.kicker}
          image={beat.image}
          imageAlt={beat.imageAlt}
          eager={index === 0}
          tall
        >
          <Kicker index={String(index + 1).padStart(2, '0')} label={beat.kicker} />
          <h2 className={`mt-4 ${titleClass}`}>{beat.title}</h2>
          <p className={bodyClass}>{beat.body}</p>
        </Film>
      ))}
      <Film image={HOME_STORY_CLOSE_IMAGE} imageAlt={HOME_STORY_CLOSE_ALT}>
        <Kicker index="07" label="원본" />
        <h2 className={`mt-4 ${titleClass}`}>{HOME_STORY_CLOSE}</h2>
        <div className="mt-8 flex flex-wrap gap-2.5">
          {user ? (
            <Cta to={startTo}>{HOME_COVER_START}</Cta>
          ) : (
            <>
              <Cta to="/guest">{HOME_COVER_GUEST}</Cta>
              <Cta to="/login" ghost>
                로그인
              </Cta>
            </>
          )}
        </div>
      </Film>
    </div>
  )
}
