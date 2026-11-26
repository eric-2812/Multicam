// Presentation page. The page kit (public/kit) lays it out, enters the hero and answers hover; on top,
// three animation libraries each do what they do best:
//   anime.js    — the product loops: running timecode, audio meters, studio lights, faders, files arriving;
//   NumberFlow  — numbers that roll to their new value (shutter, ISO, file sizes, file count);
//   Motion      — key presses that spring back, the on-screen readout that pops when it changes,
//                 and starting / stopping each loop as it comes on and off screen.
// Nothing moves because the page scrolled (but the kit's one dealt moment in #takes); loops run only on
// screen, can be paused, and rest under "reduce motion".
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import { animate as animeAnimate, createTimeline, utils } from 'animejs'
import { animate, inView, press } from 'motion'
import 'number-flow'
import type NumberFlow from 'number-flow'
import './landing.css'

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector<T>(s)
const $$ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => [...root.querySelectorAll<T>(s)]

interface Loop {
  play(): void
  pause(): void
}
let paused = false

for (const nf of $$<NumberFlow>('number-flow')) {
  nf.transformTiming = { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' }
  nf.spinTiming = { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' }
  nf.animated = !reduced
}

// ------------------------------------------------------------ the app window recording (anime.js)

const tcEls = $$('[data-tc]')
const pad = (n: number) => String(n).padStart(2, '0')
const fps = 30
const tc = { frames: 0 }
const writeTc = () => {
  const f = Math.floor(tc.frames)
  const text = `00:${pad(Math.floor(f / (60 * fps)) % 60)}:${pad(Math.floor(f / fps) % 60)}:${pad(f % fps)}`
  tcEls.forEach((el) => (el.textContent = text))
}
const tcLoop = animeAnimate(tc, { frames: [0, 60 * 60 * fps], duration: 60 * 60 * 1000, ease: 'linear', loop: true, autoplay: false, onUpdate: writeTc })

// A level that moves like sound: a smooth run through random peaks that ends where it started, so
// the loop never jumps.
const levels = (els: HTMLElement[], prop: 'scaleX' | 'scaleY', lo: number, hi: number) =>
  els.map((el, i) => {
    const pts = Array.from({ length: 14 }, () => utils.random(lo, hi, 2))
    pts.push(pts[0])
    return animeAnimate(el, {
      [prop]: pts.map((to) => ({ to, duration: utils.random(110, 220), ease: 'inOutQuad' })),
      loop: true,
      delay: i * 60,
      autoplay: false,
    })
  })

const meterLoops = levels($$('[data-meter]'), 'scaleX', 0.25, 0.92)
// the camera "pictures": lights drifting slowly, as seen through a lens
const glowLoops = $$('.glow').map((g, i) =>
  animeAnimate(g, {
    translateX: () => [0, utils.random(-8, 8)],
    translateY: () => [0, utils.random(-6, 6)],
    duration: 3200 + i * 260,
    ease: 'inOutSine',
    alternate: true,
    loop: true,
    autoplay: false,
  }),
)
const heroLoop: Loop = {
  play: () => [tcLoop, ...meterLoops, ...glowLoops].forEach((l) => l.play()),
  pause: () => [tcLoop, ...meterLoops, ...glowLoops].forEach((l) => l.pause()),
}

// ------------------------------------------------------------ a take's files (anime.js + NumberFlow)

const filesCard = $('[data-loop="files"]')
const rows = filesCard ? $$('.files li', filesCard) : []
const count = filesCard ? $<NumberFlow>('[data-count]', filesCard) : null
const sizes = filesCard ? $$<NumberFlow>('[data-size]', filesCard) : []
sizes.forEach((s) => {
  s.format = { minimumFractionDigits: 1, maximumFractionDigits: 2 }
  s.numberSuffix = ' GB'
})
function showFiles(all: boolean) {
  rows.forEach((r) => (r.style.opacity = all ? '1' : '0'))
  sizes.forEach((s) => s.update(all ? Number(s.dataset.size) : 0))
  count?.update(all ? rows.length : 0)
}
const filesTl = createTimeline({ loop: true, autoplay: false, onLoop: () => showFiles(false) })
rows.forEach((row, i) =>
  filesTl.add(
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
  ),
)
// hold the full take, then let it fade before the next one lands
filesTl.add(rows, { opacity: 0, translateY: [0, -4], duration: 320, ease: 'inQuad', delay: 1600 })
filesTl.add({}, { duration: 200 })
const filesLoop: Loop = { play: () => filesTl.play(), pause: () => filesTl.pause() }

// the editor's playhead crossing the lined-up tracks; the program cut under it lights up
const playhead = $('[data-playhead]')
const tlEl = $('.tl')
const segs = $$('.tl-pgm .seg')
const laneWidth = () => $('.tl-pgm .lane')?.getBoundingClientRect().width ?? 0
const headLoop = playhead
  ? animeAnimate(playhead, {
      translateX: [0, () => laneWidth()],
      duration: 4800,
      ease: 'linear',
      loop: true,
      autoplay: false,
      onUpdate: (a) => {
        // where the head is in this pass (progress counts all the passes of the endless loop)
        const at = a.iterationProgress * 100
        segs.forEach((g) => {
          const from = parseFloat(g.style.getPropertyValue('--a'))
          const to = parseFloat(g.style.getPropertyValue('--b'))
          g.classList.toggle('is-live', at >= from && at < to)
        })
      },
    })
  : null
if (tlEl) new ResizeObserver(() => headLoop?.refresh()).observe(tlEl)
const editLoop: Loop = { play: () => headLoop?.play(), pause: () => headLoop?.pause() }

// ------------------------------------------------------------ the camera cards

const faderLoops = levels($$('[data-fader]'), 'scaleY', 0.3, 0.92)
const allow = $('[data-allow]')
let allowTimer = 0
const camsLoop: Loop = {
  play: () => {
    faderLoops.forEach((l) => l.play())
    clearInterval(allowTimer)
    if (allow) allowTimer = window.setInterval(() => animate(allow, { scale: [1, 0.88, 1] }, { duration: 0.35 }), 3200)
  },
  pause: () => {
    faderLoops.forEach((l) => l.pause())
    clearInterval(allowTimer)
  },
}

// QR code drawn from a fixed pattern (it reads as one; it isn't meant to be scanned)
const qr = $('[data-qr]')
if (qr) {
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const corners = [
    [0, 0],
    [8, 0],
    [0, 8],
  ]
  for (let y = 0; y < 13; y++)
    for (let x = 0; x < 13; x++) {
      const c = corners.find(([cx, cy]) => x >= cx && y >= cy && x <= cx + 4 && y <= cy + 4)
      const dx = c ? x - c[0] : 0
      const dy = c ? y - c[1] : 0
      const on = c ? dx === 0 || dy === 0 || dx === 4 || dy === 4 || (dx === 2 && dy === 2) : rnd() > 0.5
      const i = document.createElement('i')
      if (!on) i.className = 'off'
      qr.append(i)
    }
}

// ------------------------------------------------------------ keys changing the camera (Motion + NumberFlow)

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
function tap(name: string) {
  const k = keysCard && $(`kbd[data-key="${name}"]`, keysCard)
  if (k) animate(k, { y: [0, 3, 0], scale: [1, 0.95, 1] }, { duration: 0.3 })
}
const keysLoop: Loop = {
  play() {
    clearInterval(keysTimer)
    keysTimer = window.setInterval(() => {
      step++
      if (step % SHUTTERS.length >= 4) tap('shift')
      tap('c')
      if (step % 2 === 0) tap('i')
      setKeys(step)
      $$('.osd', keysCard ?? document).forEach((o) => animate(o, { scale: [1, 1.04, 1] }, { duration: 0.35 }))
    }, 1300)
  },
  pause: () => clearInterval(keysTimer),
}
// a real press on a key answers with a spring
press('kbd', (el) => {
  animate(el, { scale: 0.94 }, { duration: 0.08 })
  return () => animate(el, { scale: 1 }, { type: 'spring', stiffness: 500, damping: 20 })
})

// ------------------------------------------------------------ start, stop, pause

setKeys(0)
const loops: [Loop, Element | null][] = [
  [heroLoop, $('.app-frame')],
  [filesLoop, filesCard],
  [editLoop, $('.viz-edit')],
  [camsLoop, $('#cameras .grid')],
  [keysLoop, keysCard],
]

if (reduced) showFiles(true)
else {
  showFiles(false)
  for (const [loop, el] of loops) {
    if (!el) continue
    // runs only while on screen; a pointer on it starts it again
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
  loops.forEach(([l]) => (paused ? l.pause() : l.play()))
})
