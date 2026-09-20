import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import {
  HOME_COVER_GUEST,
  HOME_COVER_LEAD,
  HOME_COVER_START,
  HOME_COVER_TITLE,
  HOME_STORY,
  HOME_STORY_CLOSE,
  HOME_STORY_CLOSE_ALT,
  HOME_STORY_CLOSE_IMAGE,
  homeStoryMuted,
  homeStorySurface,
  homeStoryWash,
  type HomeStoryTone,
} from '../lib/home/intro'

function CoverActions({ user, startTo }: { user: unknown; startTo: string }) {
  if (user) {
    return (
      <Link to={startTo} className="inline-flex rounded bg-white px-5 py-2.5 text-sm font-semibold text-accent">
        {HOME_COVER_START}
      </Link>
    )
  }
  return (
    <>
      <Link to="/guest" className="inline-flex rounded bg-white px-5 py-2.5 text-sm font-semibold text-accent">
        {HOME_COVER_GUEST}
      </Link>
      <Link to="/login" className="inline-flex rounded border border-white/40 px-5 py-2.5 text-sm font-semibold text-white">
        로그인
      </Link>
    </>
  )
}

function StoryScene({
  tone,
  image,
  imageAlt,
  eager,
  tall,
  children,
}: {
  tone: HomeStoryTone
  image: string
  imageAlt: string
  eager?: boolean
  tall?: boolean
  children: ReactNode
}) {
  return (
    <section className={`relative ${tall ? 'min-h-[160svh]' : 'min-h-[calc(100svh-3.5rem)]'} ${homeStorySurface(tone)}`}>
      <div className={`overflow-hidden ${tall ? 'sticky top-0 min-h-svh' : 'relative min-h-[calc(100svh-3.5rem)]'}`}>
        <img
          src={image}
          alt={imageAlt}
          className="absolute inset-0 h-full w-full object-cover"
          width={1376}
          height={768}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={eager ? 'high' : 'low'}
        />
        <div className={`absolute inset-0 ${homeStoryWash(tone)}`} />
        <div className="relative z-10 flex min-h-svh items-center px-5 py-16">
          <div className="mx-auto w-full max-w-[92rem]">{children}</div>
        </div>
      </div>
    </section>
  )
}

export function HomePage() {
  const { user } = useAuth()
  const startTo = user ? '/stock' : '/login'

  return (
    <div className="flex min-h-full flex-col">
      <section className="flex min-h-[calc(100svh-3.5rem)] flex-col justify-center bg-accent px-5 py-16 text-white md:py-24">
        <div className="mx-auto w-full max-w-[92rem]">
          <p className="text-3xl font-semibold tracking-tight md:text-5xl">CompanyFlow</p>
          <h1 className="mt-3 max-w-4xl text-3xl font-semibold leading-tight md:text-5xl">{HOME_COVER_TITLE}</h1>
          <p className="mt-5 max-w-2xl text-base text-white/80 md:text-lg">{HOME_COVER_LEAD}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <CoverActions user={user} startTo={startTo} />
          </div>
        </div>
      </section>
      {HOME_STORY.map((beat, index) => (
        <StoryScene
          key={beat.kicker}
          tone={beat.tone}
          image={beat.image}
          imageAlt={beat.imageAlt}
          eager={index === 0}
          tall
        >
          <p className={`text-sm font-medium tracking-[0.28em] ${homeStoryMuted(beat.tone)}`}>{beat.kicker}</p>
          <h2 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.15] tracking-tight text-balance md:text-6xl lg:text-7xl">
            {beat.title}
          </h2>
          <p className={`mt-8 max-w-xl text-lg leading-relaxed md:text-xl ${homeStoryMuted(beat.tone)}`}>{beat.body}</p>
        </StoryScene>
      ))}
      <StoryScene tone="paper" image={HOME_STORY_CLOSE_IMAGE} imageAlt={HOME_STORY_CLOSE_ALT}>
        <p className="text-sm font-medium tracking-[0.28em] text-muted">원본</p>
        <h2 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.15] tracking-tight text-balance md:text-6xl">
          {HOME_STORY_CLOSE}
        </h2>
        <div className="mt-10 flex flex-wrap gap-3">
          {user ? (
            <Link to={startTo} className="inline-flex rounded bg-accent px-5 py-2.5 text-sm font-semibold text-white">
              {HOME_COVER_START}
            </Link>
          ) : (
            <>
              <Link to="/guest" className="inline-flex rounded bg-accent px-5 py-2.5 text-sm font-semibold text-white">
                {HOME_COVER_GUEST}
              </Link>
              <Link to="/login" className="inline-flex rounded border border-line bg-card/80 px-5 py-2.5 text-sm font-semibold text-ink">
                로그인
              </Link>
            </>
          )}
        </div>
      </StoryScene>
    </div>
  )
}
