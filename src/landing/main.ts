// Presentation page. Three animation libraries, each for what it does best:
//   Motion      — the hero's entrance, and how buttons and cards answer hover and press;
//   anime.js    — the product loops: the running timecode, the audio meters, a take's files appearing;
//   NumberFlow  — numbers that roll to their new value (shutter, ISO, file sizes, file count).
// Nothing moves because the page scrolled: loops only run while their card is on screen, and under
// "reduce motion" everything rests in its final state.
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import { animate as animeAnimate, createTimeline, utils } from 'animejs'
import { animate, hover, inView, press, stagger } from 'motion'
import 'number-flow'
import type NumberFlow from 'number-flow'
import './landing.css'

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector<T>(s)
const $$ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => [...root.querySelectorAll<T>(s)]

/** Loops that can be paused from the hero's button (and stop when off screen). */
interface Loop {
  play(): void
  pause(): void
}
const loops: Loop[] = []
let paused = false

// ------------------------------------------------------------ NumberFlow defaults

for (const nf of $$<NumberFlow>('number-flow')) {
  nf.transformTiming = { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' }
  nf.spinTiming = { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' }
  nf.animated = !reduced
}

// ------------------------------------------------------------ Motion: entrance + hover / press

if (!reduced) {
  animate($$('[data-enter] [data-step]'), { opacity: [0, 1], y: [18, 0] }, { duration: 0.7, delay: stagger(0.09), ease: [0.2, 0.8, 0.2, 1] })
}

// Buttons step up on hover and press in on click; linked cards lift 2px and their photo zooms a touch.
hover('.btn, .nav-links a, .link-arrow', (el) => {
  const a = animate(el, { y: -1 }, { duration: 0.18 })
  return () => {
    a.stop()
    animate(el, { y: 0 }, { duration: 0.18 })
  }
})
press('.btn, kbd', (el) => {
  animate(el, { scale: 0.96 }, { duration: 0.1 })
  return () => animate(el, { scale: 1 }, { type: 'spring', stiffness: 500, damping: 22 })
})
hover('.cam-card', (card) => {
  const ui = $('.cam-ui > *', card)
  const a = animate(card, { y: -2 }, { duration: 0.22 })
  const b = ui ? animate(ui, { scale: 1.03 }, { duration: 0.5 }) : null
  return () => {
    a.stop()
    b?.stop()
    animate(card, { y: 0 }, { duration: 0.22 })
    if (ui) animate(ui, { scale: 1 }, { duration: 0.5 })
  }
})

// A QR code drawn from a fixed pattern (it isn't meant to be scanned, it just reads as one).
const qr = $('[data-qr]')
if (qr) {
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const corners = [
    [0, 0],
    [8, 0],
    [0, 8],
  ]
  const inCorner = (x: number, y: number) => corners.find(([cx, cy]) => x >= cx && y >= cy && x <= cx + 4 && y <= cy + 4)
  for (let y = 0; y < 13; y++)
    for (let x = 0; x < 13; x++) {
      const c = inCorner(x, y)
      const dx = c ? x - c[0] : 0
      const dy = c ? y - c[1] : 0
      const on = c ? dx === 0 || dy === 0 || dx === 4 || dy === 4 || (dx === 2 && dy === 2) : rnd() > 0.5
      const i = document.createElement('i')
      if (!on) i.className = 'off'
      qr.append(i)
    }
}

// ------------------------------------------------------------ anime.js: the app frame recording

const tcEl = $('[data-tc]')
const pad = (n: number) => String(n).padStart(2, '0')
const fps = 30
const tc = { frames: 0 }
const tcLoop = animeAnimate(tc, {
  frames: [0, 60 * 60 * fps],
  duration: 60 * 60 * 1000,
  ease: 'linear',
  loop: true,
  autoplay: false,
  onUpdate: () => {
    const f = Math.floor(tc.frames)
    if (tcEl) tcEl.textContent = `00:${pad(Math.floor(f / (60 * fps)) % 60)}:${pad(Math.floor(f / fps) % 60)}:${pad(f % fps)}`
  },
})

// Meters: each bounces at its own pace, like voices taking turns.
const meters = $$('[data-meter]')
const meterLoops = meters.map((m, i) =>
  animeAnimate(m, {
    scaleX: () => [utils.random(0.15, 0.35, 2), utils.random(0.55, 0.95, 2)],
    duration: () => utils.random(180, 420),
    ease: 'inOutSine',
    alternate: true,
    loop: true,
    delay: i * 90,
    autoplay: false,
  }),
)

// The camera "pictures" drift slowly, like lights seen through a lens.
const glowLoops = $$('.glow').map((g, i) =>
  animeAnimate(g, {
    translateX: () => [0, utils.random(-14, 14)],
    translateY: () => [0, utils.random(-10, 10)],
    scale: [1, 1.08],
    duration: 3200 + i * 260,
    ease: 'inOutSine',
    alternate: true,
    loop: true,
    autoplay: false,
  }),
)

loops.push({
  play: () => {
    tcLoop.play()
    meterLoops.forEach((l) => l.play())
    glowLoops.forEach((l) => l.play())
  },
  pause: () => {
    tcLoop.pause()
    meterLoops.forEach((l) => l.pause())
    glowLoops.forEach((l) => l.pause())
  },
})

// Camera cards: the mixer's faders move, and "Allow" gets pressed every few seconds.
const faderLoops = $$('[data-fader]').map((f, i) =>
  animeAnimate(f, {
    scaleY: () => [utils.random(0.25, 0.45, 2), utils.random(0.6, 0.95, 2)],
    duration: () => utils.random(260, 520),
    ease: 'inOutSine',
    alternate: true,
    loop: true,
    delay: i * 70,
    autoplay: false,
  }),
)
const allow = $('[data-allow]')
const allowLoop = allow ? animeAnimate(allow, { scale: [1, 0.9, 1], duration: 360, ease: 'outQuad', loop: true, loopDelay: 2800, autoplay: false }) : null
const camsLoop: Loop = {
  play: () => {
    faderLoops.forEach((l) => l.play())
    allowLoop?.play()
  },
  pause: () => {
    faderLoops.forEach((l) => l.pause())
    allowLoop?.pause()
  },
}

// ------------------------------------------------------------ anime.js + NumberFlow: a take's files

const filesCard = $('[data-loop="files"]')
const rows = filesCard ? $$('.files li', filesCard) : []
const count = filesCard ? $<NumberFlow>('[data-count]', filesCard) : null
const sizes = filesCard ? $$<NumberFlow>('[data-size]', filesCard) : []
const gb = { minimumFractionDigits: 1, maximumFractionDigits: 2 } as const
sizes.forEach((s) => {
  s.format = gb
  s.numberSuffix = ' GB'
})

function showFiles(all: boolean) {
  rows.forEach((r) => (r.style.opacity = all ? '1' : '0'))
  sizes.forEach((s) => s.update(all ? Number(s.dataset.size) : 0))
  count?.update(all ? rows.length : 0)
}

let filesTl: ReturnType<typeof createTimeline> | null = null
function buildFilesTimeline() {
  // ~3.6 s: files land one by one, sizes roll up, then the set rests and starts again.
  filesTl = createTimeline({ loop: true, autoplay: false, onLoop: () => showFiles(false) })
  rows.forEach((row, i) => {
    filesTl!.add(
      row,
      {
        opacity: [0, 1],
        translateY: [8, 0],
        duration: 260,
        ease: 'outCubic',
        onBegin: () => {
          sizes[i]?.update(Number(sizes[i].dataset.size))
          count?.update(i + 1)
        },
      },
      i === 0 ? 300 : '-=120',
    )
  })
  filesTl.add({}, { duration: 1500 })
}

// ------------------------------------------------------------ NumberFlow: keys changing the camera

const keysCard = $('[data-loop="keys"]')
const shutter = keysCard ? $<NumberFlow>('[data-shutter]', keysCard) : null
const angle = keysCard ? $<NumberFlow>('[data-angle]', keysCard) : null
const iso = keysCard ? $<NumberFlow>('[data-iso]', keysCard) : null
const SHUTTERS = [50, 60, 100, 125, 100, 60]
const ISOS = [400, 800, 1600, 800]
let step = 0
let keysTimer = 0

function setKeys(i: number) {
  const s = SHUTTERS[i % SHUTTERS.length]
  shutter?.update(s)
  angle?.update(Math.round((360 * 25) / s))
  iso?.update(ISOS[i % ISOS.length])
}

function pressKey(name: string) {
  const k = $(`kbd[data-key="${name}"]`, keysCard!)
  if (!k || reduced) return
  animeAnimate(k, { translateY: [0, 2, 0], backgroundColor: ['#27272a', '#3f3f46', '#27272a'], duration: 320, ease: 'outQuad' })
}

const keysLoop: Loop = {
  play() {
    clearInterval(keysTimer)
    keysTimer = window.setInterval(() => {
      step++
      const goingDown = step % SHUTTERS.length >= 4
      if (goingDown) pressKey('shift')
      pressKey('c')
      if (step % 2 === 0) pressKey('i')
      setKeys(step)
    }, 1300)
  },
  pause() {
    clearInterval(keysTimer)
  },
}

// ------------------------------------------------------------ start, stop, pause

setKeys(0)
if (reduced || !filesCard) showFiles(true)
else {
  showFiles(false)
  buildFilesTimeline()
  loops.push({ play: () => filesTl?.play(), pause: () => filesTl?.pause() })
}
loops.push(keysLoop, camsLoop)

const sectionOf = new Map<Loop, Element | null>([
  [loops[0], $('.app-frame')],
  ...(filesTl ? ([[loops[1], filesCard]] as [Loop, Element | null][]) : []),
  [keysLoop, keysCard],
  [camsLoop, $('.cams')],
])

if (!reduced) {
  for (const [loop, el] of sectionOf) {
    if (!el) continue
    // Run only while on screen; restart on hover, as the card loops do.
    inView(el, () => {
      if (!paused) loop.play()
      return () => loop.pause()
    })
    el.addEventListener('pointerenter', () => !paused && loop.play())
  }
}

const pauseBtn = $<HTMLButtonElement>('[data-pause]')
if (reduced && pauseBtn) pauseBtn.hidden = true
pauseBtn?.addEventListener('click', () => {
  paused = !paused
  pauseBtn.setAttribute('aria-pressed', String(paused))
  pauseBtn.textContent = paused ? 'Play motion' : 'Pause motion'
  loops.forEach((l) => (paused ? l.pause() : l.play()))
})
