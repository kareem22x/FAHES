'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { motion, useAnimationFrame, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, Lock, MapPin, Pause, Play } from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import {
  COMING_SOON_LABEL,
  COMING_SOON_MESSAGE,
  SUPPORTED_CITIES,
  easternProvinceCityProfiles,
  type CityProfile,
} from '@/lib/locations/saudi-cities'

/* ==========================================================================
   Tuning
   ========================================================================== */

/**
 * Auto-scroll speed in px/second. Deliberately slow: at 34px/s a 322px card
 * takes ~9.5s to cross, which is slow enough to read the city name and landmark
 * caption as it passes. Faster than ~60px/s and the section reads as a gimmick.
 */
const AUTO_SCROLL_SPEED = 34

/** px/second while an arrow nudge or a focus reveal is animating. */
const NUDGE_SPEED = 620

/** Longest frame we will integrate. Tab-switching produces a huge delta. */
const MAX_FRAME_MS = 64

/**
 * The carousel renders two identical copies of the list and translates the
 * track. When the offset reaches the distance between the two copies, the
 * second copy sits exactly where the first one started, so subtracting that
 * distance is invisible — that is the whole infinite-loop trick.
 */
const COPIES = 2

const CARD_WIDTH = 'w-[322px] max-[1024px]:w-[300px] max-[680px]:w-[76vw]'

/* ==========================================================================
   Section
   ========================================================================== */

/**
 * CitiesSection — "تغطيتنا في المنطقة الشرقية".
 *
 * Shows every Eastern Province city we know about, with the five we actually
 * serve rendered in full colour and the rest greyed out as coming-soon. The
 * cards ride an infinite, slow, continuously-moving rail that pauses while the
 * pointer is over it, and the arrows step it one card at a time.
 *
 * Why a transform track instead of a scroll container: a scroll container
 * cannot loop infinitely without cloning-and-jumping `scrollLeft`, and its
 * `scroll-snap` fights an auto-advance. Translating a duplicated track gives a
 * genuinely seamless loop, and the RTL/LTR difference collapses to a single
 * sign (see `directionSign`).
 */
export default function CitiesSection({
  cities = easternProvinceCityProfiles,
}: {
  cities?: CityProfile[]
}) {
  const supportedCount = cities.filter((city) => city.supported).length
  const comingSoonCount = cities.length - supportedCount

  return (
    <section id="cities" className="site-cities-section">
      <div className="site-cities-glow" aria-hidden="true" />
      <div className="site-container site-cities-inner">
        {/*
          `data-reveal` is the site-wide scroll-reveal contract (engine:
          `/css-system/animations.js`, styles: `app/design-system.css`). The
          intro slides in from the reading-start edge like every other section
          heading; the gallery follows it a beat later. Both attributes sit on
          blocks that comfortably fit the viewport — the engine's 0.15
          intersection threshold would never be met by an element taller than
          the viewport, leaving it permanently hidden.
        */}
        <div className="site-cities-intro" data-reveal="start">
          <span className="site-eyebrow site-eyebrow-light">تغطيتنا في المنطقة الشرقية</span>
          <h2>
            سيارتك بأي مدينة؟
            <br />
            <span>نفحصها عنك.</span>
          </h2>
          {/* Derived from the data so the sentence can never claim a city the
              booking form would reject. */}
          <p>{coverageSentence()}</p>
        </div>

        <div className="site-cities-gallery-block" data-reveal="up" data-reveal-delay="90">
          <div className="site-cities-gallery-head">
            <span className="site-eyebrow site-eyebrow-light">مدننا ومعالمها</span>
            <p>
              {supportedCount} مدن متاحة الآن، و{comingSoonCount} قيد التغطية.
            </p>
          </div>

          <CityCarousel cities={cities} />

          <p className="site-cities-disclaimer">
            الصور توضيحية لأبرز معالم كل مدينة. المدن المظللة غير مدعومة حاليًا.
          </p>
        </div>

        <div className="site-cities-decoration" aria-hidden="true">
          <MapPin size={74} strokeWidth={0.8} />
        </div>
      </div>
    </section>
  )
}

/**
 * "نغطي حالياً أهم مدن ومحافظات المنطقة الشرقية: الدمام، الخبر، الجبيل، القطيف،
 * والأحساء." — built from `SUPPORTED_CITIES` rather than hard-coded, so adding or
 * removing a city updates the sentence, the stat and the dropdown together.
 */
function coverageSentence(): string {
  const names = [...SUPPORTED_CITIES]
  const last = names.pop()
  return `نغطي حالياً أهم مدن ومحافظات المنطقة الشرقية: ${names.join('، ')}، و${last}.`
}

/* ==========================================================================
   Carousel
   ========================================================================== */

function CityCarousel({ cities }: { cities: CityProfile[] }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  /** Distance travelled along the track, in px. Monotonically grows, wraps. */
  const offsetRef = useRef(0)
  /** Width of one copy — the wrap distance. 0 until measured. */
  const loopRef = useRef(0)
  /** px still owed to a manual step. Signed in offset units. */
  const nudgeRef = useRef(0)
  /** +1 when the track's writing direction is RTL, -1 for LTR. */
  const signRef = useRef(1)
  /** True while the pointer rests on the rail (hover-to-pause). */
  const holdRef = useRef(false)
  /** True when the visitor pressed the pause button. */
  const stoppedRef = useRef(false)

  /*
    كان `useReducedMotion()` يُستخدم لإيقاف زحف الكاروسيل نهائيًا عند تفعيل
    «تقليل الحركة» في نظام التشغيل — ويعطي `true` فيُثبّت الشريط بلا أي وسيلة
    لتشغيله (زر الإيقاف/التشغيل يُخفى أيضًا في نفس الحالة).

    أُبقي الاستيراد والقيمة محسوبين لعرض الزر بشكل صحيح، لكن لم يعد يُستخدم
    لإيقاف الحركة: القرار صريح بالتشغيل الكامل لكل الزوار. إن أردت الاستعادة،
    أعد `reduceRef.current = Boolean(reduceMotion)` في الـeffect أسفله.
  */
  const reduceMotion = useReducedMotion()
  const reduceRef = useRef(false)
  const [stopped, setStopped] = useState(false)

  useEffect(() => {
    // intentionally not driven by reduceMotion any more — see note above
    reduceRef.current = false
  }, [reduceMotion])

  /* ---- geometry --------------------------------------------------------- */

  const applyTransform = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    // `sign` is what makes this work in both directions without duplicating the
    // maths: in RTL the track has to travel *right* to reveal what lies further
    // along the row, in LTR it travels left.
    track.style.transform = `translate3d(${signRef.current * offsetRef.current}px, 0, 0)`
  }, [])

  const wrapOffset = useCallback(() => {
    const loop = loopRef.current
    if (loop <= 0) return
    // `%` rather than a while-loop: a single huge delta (returning from a
    // background tab) can exceed the loop width many times over.
    offsetRef.current = ((offsetRef.current % loop) + loop) % loop
  }, [])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    const measure = () => {
      const [first, second] = Array.from(track.children) as HTMLElement[]
      if (!first || !second) return

      signRef.current = getComputedStyle(track).direction === 'rtl' ? 1 : -1

      // The gap between the two copies' leading edges *is* one loop, because
      // copy two starts exactly one card-gap after copy one ends.
      const distance = Math.abs(
        second.getBoundingClientRect().left - first.getBoundingClientRect().left,
      )
      if (distance > 0) loopRef.current = distance

      wrapOffset()
      applyTransform()
    }

    measure()

    // Card widths change at every breakpoint, so the loop distance has to be
    // re-measured rather than computed once.
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    for (const child of Array.from(track.children)) observer.observe(child)

    return () => observer.disconnect()
  }, [applyTransform, wrapOffset, cities.length])

  /* ---- the motion loop -------------------------------------------------- */

  /**
   * Wall-clock stamp of the previous frame.
   *
   * The loop deliberately does *not* use `useAnimationFrame`'s `delta`
   * argument. That value was measured at ~22ms per frame while the page was
   * genuinely rendering at 28fps (35ms), which made the rail run at 21px/s
   * instead of the configured 34px/s. `performance.now()` is monotonic and
   * exact, so the speed is the same on a 60Hz phone and a throttled tab.
   */
  const lastFrameRef = useRef(0)

  const isHeld = useCallback(
    () => holdRef.current || stoppedRef.current || reduceRef.current || document.hidden,
    [],
  )

  useAnimationFrame(() => {
    const now = performance.now()
    const previous = lastFrameRef.current
    lastFrameRef.current = now
    // First frame after mount, and any frame after a tab switch, would
    // otherwise integrate a huge (or zero) step and jump the rail.
    if (previous === 0) return
    const dt = Math.min(now - previous, MAX_FRAME_MS) / 1000

    const nudge = nudgeRef.current
    if (nudge !== 0) {
      // A manual step keeps working even while auto-scroll is paused.
      const step = Math.sign(nudge) * Math.min(Math.abs(nudge), NUDGE_SPEED * dt)
      nudgeRef.current = nudge - step
      offsetRef.current += step
    } else if (isHeld()) {
      return
    } else {
      offsetRef.current += AUTO_SCROLL_SPEED * dt
    }

    wrapOffset()
    applyTransform()
  })

  /* ---- controls --------------------------------------------------------- */

  /** One card plus one gap, measured from the live DOM. */
  const stepSize = useCallback(() => {
    const track = trackRef.current
    const card = track?.querySelector<HTMLElement>('[data-city-card]')
    if (!track || !card) return 340
    const gap = parseFloat(getComputedStyle(track).columnGap || '0') || 0
    return card.getBoundingClientRect().width + gap
  }, [])

  const step = useCallback(
    (direction: 1 | -1) => {
      nudgeRef.current += direction * stepSize()
    },
    [stepSize],
  )

  const toggleStopped = useCallback(() => {
    setStopped((current) => {
      stoppedRef.current = !current
      return !current
    })
  }, [])

  if (cities.length === 0) return null

  return (
    <div
      className="grid gap-4"
      role="region"
      aria-label="مدن ومحافظات المنطقة الشرقية وأبرز معالمها"
    >
      <div
        ref={viewportRef}
        className="city-rail-mask relative overflow-hidden py-5"
        onPointerEnter={() => {
          holdRef.current = true
        }}
        onPointerLeave={() => {
          holdRef.current = false
        }}
        // Touch has no hover, so a tap-and-hold is the closest equivalent.
        onTouchStart={() => {
          holdRef.current = true
        }}
        onTouchEnd={() => {
          holdRef.current = false
        }}
      >
        <div
          ref={trackRef}
          className="flex w-max gap-[var(--city-gap)] will-change-transform"
          style={{ '--city-gap': '0.9rem' } as CSSProperties}
        >
          {Array.from({ length: COPIES }, (_, copy) => (
            <div
              key={copy}
              // The second copy exists only to make the loop seamless. It stays
              // clickable (so there is no dead zone under the pointer) but is
              // hidden from assistive tech and carries no focusable content.
              aria-hidden={copy === 1 || undefined}
              {...(copy === 0 ? { role: 'list' } : {})}
              className="flex shrink-0 gap-[var(--city-gap)]"
            >
              {cities.map((city) => (
                <CityCard key={`${copy}-${city.slug}`} city={city} />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="المدينة السابقة"
          className="grid size-11 shrink-0 place-items-center rounded-full border border-white/20 bg-white/10 text-white transition hover:-translate-y-0.5 hover:border-white/40 hover:bg-white/20 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand-400)]"
        >
          <ArrowRight size={18} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => step(1)}
          aria-label="المدينة التالية"
          className="grid size-11 shrink-0 place-items-center rounded-full border border-white/20 bg-white/10 text-white transition hover:-translate-y-0.5 hover:border-white/40 hover:bg-white/20 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand-400)]"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </button>

        {/*
          WCAG 2.2.2 (Pause, Stop, Hide): auto-updating content needs a way to
          stop it that does not depend on hovering. It is also the only way to
          pause on touch, where hover does not exist.

          The button is now always rendered — the carousel no longer pauses
          itself on `prefers-reduced-motion`, so hiding the control in that
          state would strand the rail running with no way to stop it.
        */}
        {(
          <button
            type="button"
            onClick={toggleStopped}
            aria-pressed={stopped}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 text-[13px] font-bold text-white transition hover:border-white/40 hover:bg-white/20 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand-400)]"
          >
            {stopped ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
            {stopped ? 'تشغيل الحركة' : 'إيقاف الحركة'}
          </button>
        )}
      </div>
    </div>
  )
}

/* ==========================================================================
   Card
   ========================================================================== */

function CityCard({ city }: { city: CityProfile }) {
  const locked = !city.supported

  const notify = useCallback(() => {
    // A stable id keeps repeat clicks from stacking identical toasts.
    toast(`${city.name} — ${COMING_SOON_LABEL}`, {
      id: `city-coming-soon-${city.slug}`,
      description: COMING_SOON_MESSAGE,
      icon: <Lock size={16} aria-hidden="true" />,
    })
  }, [city.name, city.slug])

  return (
    <article
      data-city-card
      data-supported={city.supported}
      // Not a control: the card is a showcase, and the locked state is a
      // courtesy hint for a pointer. Nothing here enters the tab order, so the
      // infinite track never traps or hides keyboard focus.
      onClick={locked ? notify : undefined}
      title={locked ? COMING_SOON_MESSAGE : undefined}
      className={cn(
        CARD_WIDTH,
        'group/city relative shrink-0 overflow-hidden rounded-2xl border transition duration-500',
        locked
          ? 'cursor-not-allowed border-white/10 bg-white/[0.03] opacity-50 grayscale'
          : 'border-white/15 bg-white/[0.07] shadow-[0_18px_42px_rgba(3,12,28,0.32)] hover:-translate-y-1.5 hover:border-white/35 hover:shadow-[0_32px_64px_rgba(3,12,28,0.48)]',
      )}
    >
      <div className="relative aspect-[3/2] overflow-hidden bg-[#0b1f46]">
        <Image
          src={city.image}
          alt={`${city.landmark} في ${city.name}`}
          fill
          loading="lazy"
          sizes="(max-width: 680px) 76vw, 322px"
          className="object-cover transition-transform duration-[1100ms] group-hover/city:scale-[1.06]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[image:linear-gradient(180deg,rgba(4,14,33,0.06)_34%,rgba(4,14,33,0.72)_100%)]"
        />
        <motion.span
          className={cn(
            'absolute end-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11.5px] font-bold backdrop-blur-sm',
            locked
              ? 'border-white/25 bg-[#061632]/70 text-white/75'
              : 'border-[#7fd4a8]/35 bg-[#06301f]/60 text-[#a7ecc6]',
          )}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        >
          {locked ? (
            <>
              <Lock size={12} aria-hidden="true" />
              {COMING_SOON_LABEL}
            </>
          ) : (
            <>
              <Check size={12} aria-hidden="true" />
              متاحة الآن
            </>
          )}
        </motion.span>
      </div>

      <div className="grid gap-1.5 p-4">
        <span className="inline-flex items-center gap-1.5 justify-self-start rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11.5px] font-bold text-[var(--brand-200)]">
          <MapPin size={13} aria-hidden="true" />
          {city.landmark}
        </span>
        <h3 className="text-[17px] font-extrabold text-white">{city.name}</h3>
        <p className="text-[12.5px] leading-[1.9] text-white/65">{city.note}</p>
      </div>
    </article>
  )
}
