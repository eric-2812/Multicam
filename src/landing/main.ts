// Presentation page. The page kit (public/kit) lays it out, enters the hero and answers hover; on top,
// three animation libraries each do what they do best:
//   anime.js    — the product loops: running timecode, audio meters, studio lights, faders, files arriving;
//   NumberFlow  — numbers that roll to their new value (shutter, ISO, file sizes, file count);
//   Motion      — key presses that spring back, the on-screen readout that pops when it changes,
//                 and starting / stopping each loop as it comes on and off screen.
// Nothing moves because the page scrolled (but the kit's one dealt moment in #takes); loops run only on
// screen, can be paused, and rest under "reduce motion".
//
// This file starts what the first screen shows (the recording app window). The sections further down
// (sections.ts, with NumberFlow and Motion's springs) load once the page is idle, so the first screen
// isn't kept waiting for them.
import '../fonts.css'
import { animate as animeAnimate, utils } from 'animejs'
import { $, $$, reduced, register, setPaused } from './loops'
import { levels } from './levels'
import './landing.css'

// ------------------------------------------------------------ the app window recording (anime.js)

const tcEls = $$('[data-tc]')
const pad = (n: number) => String(n).padStart(2, '0')
const fps = 30
const tc = { frames: 0 }
let shown = -1
const writeTc = () => {
  const f = Math.floor(tc.frames)
  if (f === shown) return // a screen refresh between two frames: nothing to redraw
  shown = f
  const text = `00:${pad(Math.floor(f / (60 * fps)) % 60)}:${pad(Math.floor(f / fps) % 60)}:${pad(f % fps)}`
  tcEls.forEach((el) => (el.textContent = text))
}
const tcLoop = animeAnimate(tc, { frames: [0, 60 * 60 * fps], duration: 60 * 60 * 1000, ease: 'linear', loop: true, autoplay: false, onUpdate: writeTc })

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
const hero = [tcLoop, ...meterLoops, ...glowLoops]
register({ play: () => hero.forEach((l) => l.play()), pause: () => hero.forEach((l) => l.pause()) }, $('.app-frame'))

// ------------------------------------------------------------ pause, and the rest of the page

const pauseBtn = $<HTMLButtonElement>('[data-pause]')
if (reduced && pauseBtn) pauseBtn.hidden = true
let paused = false
pauseBtn?.addEventListener('click', () => {
  paused = !paused
  pauseBtn.setAttribute('aria-pressed', String(paused))
  pauseBtn.textContent = paused ? 'Play motion' : 'Pause motion'
  setPaused(paused)
})

const later = (f: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(f, { timeout: 1500 }) : setTimeout(f, 300))
later(() => void import('./sections'))
