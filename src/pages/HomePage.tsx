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
  type HomeStoryTone,
} from '../lib/home/intro'

const kickerClass = 'text-[14px] font-semibold leading-none'
const titleClass =
  'whitespace-pre-line break-keep text-[34px] font-semibold leading-[1.15] md:text-[40px] md:leading-[1.1] lg:text-[56px] lg:leading-[1.07]'
const bodyClass = 'mt-6 max-w-[26rem] whitespace-pre-line text-[17px] font-normal leading-[1.47]'

function Cta({
  to,
  children,
  variant,
}: {
  to: string
  children: ReactNode
  variant: 'light' | 'lightGhost' | 'dark' | 'darkGhost'
}) {
  const styles = {
    light: 'bg-white text-accent',
    lightGhost: 'border border-white/35 bg-transparent text-white',
    dark: 'bg-accent text-white',
    darkGhost: 'border border-black/10 bg-white text-ink',
  }[variant]
  return (
    <Link
      to={to}
      className={`inline-flex h-11 items-center rounded-full px-[22px] text-[17px] font-normal ${styles}`}
    >
      {children}
    </Link>
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
    <section className={`relative ${tall ? 'min-h-[170svh]' : ''} ${homeStorySurface(tone)}`}>
      <div
        className={
          tall
            ? 'sticky top-14 flex min-h-[calc(100svh-3.5rem)] items-center'
            : 'flex min-h-[calc(100svh-3.5rem)] items-center'
        }
      >
        <div className="mx-auto grid w-full max-w-[90rem] items-center gap-10 px-6 py-16 md:px-10 lg:grid-cols-[minmax(18rem,26.5rem)_minmax(0,1fr)] lg:gap-x-20 lg:py-0">
          <div className="max-w-[26.5rem]">{children}</div>
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[28px] shadow-[0_3px_30px_rgba(0,0,0,0.18)] lg:aspect-auto lg:h-[min(72vh,40rem)]">
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
          </div>
        </div>
      </div>
    </section>
  )
}

export function HomePage() {
  const { user } = useAuth()
  const startTo = user ? '/stock' : '/login'

  return (
    <div className="flex min-h-full flex-col antialiased">
      <section className="flex min-h-[calc(100svh-3.5rem)] flex-col justify-center bg-accent px-6 py-24 text-white md:px-10">
        <div className="mx-auto w-full max-w-[90rem]">
          <p className="text-[21px] font-semibold leading-none tracking-tight">CompanyFlow</p>
          <h1 className={`${titleClass} mt-4 max-w-[11em] text-white`}>{HOME_COVER_TITLE}</h1>
          <p className={`${bodyClass} text-white/70`}>{HOME_COVER_LEAD}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {user ? (
              <Cta to={startTo} variant="light">
                {HOME_COVER_START}
              </Cta>
            ) : (
              <>
                <Cta to="/guest" variant="light">
                  {HOME_COVER_GUEST}
                </Cta>
                <Cta to="/login" variant="lightGhost">
                  로그인
                </Cta>
              </>
            )}
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
          <p className={`${kickerClass} ${homeStoryMuted(beat.tone)}`}>{beat.kicker}</p>
          <h2 className={`mt-3 ${titleClass}`}>{beat.title}</h2>
          <p className={`${bodyClass} ${homeStoryMuted(beat.tone)}`}>{beat.body}</p>
        </StoryScene>
      ))}
      <StoryScene tone="paper" image={HOME_STORY_CLOSE_IMAGE} imageAlt={HOME_STORY_CLOSE_ALT}>
        <h2 className={titleClass}>{HOME_STORY_CLOSE}</h2>
        <div className="mt-8 flex flex-wrap gap-3">
          {user ? (
            <Cta to={startTo} variant="dark">
              {HOME_COVER_START}
            </Cta>
          ) : (
            <>
              <Cta to="/guest" variant="dark">
                {HOME_COVER_GUEST}
              </Cta>
              <Cta to="/login" variant="darkGhost">
                로그인
              </Cta>
            </>
          )}
        </div>
      </StoryScene>
    </div>
  )
}
