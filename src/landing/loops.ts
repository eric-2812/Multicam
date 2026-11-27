// The page's animation loops: each one runs only while it is on screen, all of them stop with the
// "Pause motion" button, and none starts under "reduce motion".
import { inView } from 'motion'

export interface Loop {
  play(): void
  pause(): void
}

export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
export const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector<T>(s)
export const $$ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => [...root.querySelectorAll<T>(s)]

const loops: Loop[] = []
let paused = false

export function register(loop: Loop, el: Element | null) {
  if (!el || reduced) return
  loops.push(loop)
  // runs only while on screen; a pointer on it starts it again
  inView(el, () => {
    if (!paused) loop.play()
    return () => loop.pause()
  })
  el.addEventListener('pointerenter', () => !paused && loop.play())
}

export function setPaused(p: boolean) {
  paused = p
  loops.forEach((l) => (p ? l.pause() : l.play()))
}
