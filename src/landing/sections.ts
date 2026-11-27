// The sections below the first screen: a take's files, the editor's timeline, the camera cards and
// the keyboard card. main.ts loads this once the page is idle.
import { animate as animeAnimate, createTimeline } from 'animejs'
import { animate, press } from 'motion'
import 'number-flow'
import type NumberFlow from 'number-flow'
import { levels } from './levels'
import { $, $$, reduced, register } from './loops'

for (const nf of $$<NumberFlow>('number-flow')) {
  nf.transformTiming = { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' }
  nf.spinTiming = { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' }
  nf.animated = !reduced
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
register({ play: () => filesTl.play(), pause: () => filesTl.pause() }, filesCard)

// the editor's playhead crossing the lined-up tracks; the program cut under it lights up
const playhead = $('[data-playhead]')
const tlEl = $('.tl')
const segs = $$('.tl-pgm .seg').map((g) => ({
  g,
  from: parseFloat(g.style.getPropertyValue('--a')),
  to: parseFloat(g.style.getPropertyValue('--b')),
}))
let laneW = 0
const measure = () => (laneW = $('.tl-pgm .lane')?.getBoundingClientRect().width ?? 0)
const headLoop = playhead
  ? animeAnimate(playhead, {
      translateX: [0, () => laneW],
      duration: 4800,
      ease: 'linear',
      loop: true,
      autoplay: false,
      onUpdate: (a) => {
        // where the head is in this pass (progress counts all the passes of the endless loop)
        const at = a.iterationProgress * 100
        for (const s of segs) s.g.classList.toggle('is-live', at >= s.from && at < s.to)
      },
    })
  : null
// measured once and on resize, not on every frame
if (tlEl)
  new ResizeObserver(() => {
    measure()
    headLoop?.refresh()
  }).observe(tlEl)
register({ play: () => headLoop?.play(), pause: () => headLoop?.pause() }, $('.viz-edit'))

// ------------------------------------------------------------ the camera cards

const faderLoops = levels($$('[data-fader]'), 'scaleY', 0.3, 0.92)
const allow = $('[data-allow]')
let allowTimer = 0
register(
  {
    play: () => {
      faderLoops.forEach((l) => l.play())
      clearInterval(allowTimer)
      if (allow) allowTimer = window.setInterval(() => animate(allow, { scale: [1, 0.88, 1] }, { duration: 0.35 }), 3200)
    },
    pause: () => {
      faderLoops.forEach((l) => l.pause())
      clearInterval(allowTimer)
    },
  },
  $('#cameras .grid'),
)

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
  const cells = document.createDocumentFragment()
  for (let y = 0; y < 13; y++)
    for (let x = 0; x < 13; x++) {
      const c = corners.find(([cx, cy]) => x >= cx && y >= cy && x <= cx + 4 && y <= cy + 4)
      const dx = c ? x - c[0] : 0
      const dy = c ? y - c[1] : 0
      const on = c ? dx === 0 || dy === 0 || dx === 4 || dy === 4 || (dx === 2 && dy === 2) : rnd() > 0.5
      const i = document.createElement('i')
      if (!on) i.className = 'off'
      cells.append(i)
    }
  qr.append(cells)
}

// ------------------------------------------------------------ keys changing the camera (Motion + NumberFlow)

const keysCard = $('[data-loop="keys"]')
const shutter = keysCard ? $<NumberFlow>('[data-shutter]', keysCard) : null
const angle = keysCard ? $<NumberFlow>('[data-angle]', keysCard) : null
const iso = keysCard ? $<NumberFlow>('[data-iso]', keysCard) : null
const osds = keysCard ? $$('.osd', keysCard) : []
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
register(
  {
    play() {
      clearInterval(keysTimer)
      keysTimer = window.setInterval(() => {
        step++
        if (step % SHUTTERS.length >= 4) tap('shift')
        tap('c')
        if (step % 2 === 0) tap('i')
        setKeys(step)
        osds.forEach((o) => animate(o, { scale: [1, 1.04, 1] }, { duration: 0.35 }))
      }, 1300)
    },
    pause: () => clearInterval(keysTimer),
  },
  keysCard,
)
// a real press on a key answers with a spring
press('kbd', (el) => {
  animate(el, { scale: 0.94 }, { duration: 0.08 })
  return () => animate(el, { scale: 1 }, { type: 'spring', stiffness: 500, damping: 20 })
})

setKeys(0)
showFiles(reduced)
