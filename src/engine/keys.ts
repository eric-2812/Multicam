import { useSyncExternalStore } from 'react'
import { store } from '../store'
import type { CamSettings, VideoSource } from '../types'
import { changeSettings } from './devices'
import { ISO_STOPS, ND_LABEL, ND_STEPS, apertureStops, posOf, shutterAngle, shutterLabel, shutterStops, type Stop } from './lens'
import { recorder } from './recorder'
import { video } from './video'

/**
 * Keyboard shortcuts the user can rebind. Camera actions change the selected camera (the one
 * open in the settings panel) and only work for controls its hardware has, like the panel.
 */

export type Group = 'switch' | 'camera'

export interface KeyAction {
  id: string
  label: string
  group: Group
  /** Default key, written like "C", "Shift+C", "Space" or "ArrowUp". */
  def: string | null
  /** Holding the key repeats it (adjustments). Toggles fire once per press. */
  repeat?: boolean
  run(): void
}

// ------------------------------------------------------------ on-screen readout

export type Osd = { id: number; text: string; tone: 'info' | 'bad' } | null
let osdState: Osd = null
let osdTimer = 0
let osdId = 0
const osdListeners = new Set<() => void>()
export function osd(text: string, tone: 'info' | 'bad' = 'info') {
  osdState = { id: ++osdId, text, tone }
  osdListeners.forEach((l) => l())
  clearTimeout(osdTimer)
  osdTimer = window.setTimeout(() => {
    osdState = null
    osdListeners.forEach((l) => l())
  }, 1600)
}
export function useOsd() {
  return useSyncExternalStore(
    (l) => {
      osdListeners.add(l)
      return () => osdListeners.delete(l)
    },
    () => osdState,
  )
}

// ------------------------------------------------------------ camera adjustments

function target(): VideoSource | null {
  const st = store.get()
  return st.sources.find((s) => s.id === st.selected) ?? st.sources[0] ?? null
}

const camName = (src: VideoSource) => `Cam ${src.number} · ${src.name}`

/** Run fn on the selected camera, or explain why nothing happened. */
function onCam(what: string, has: (src: VideoSource) => boolean, fn: (src: VideoSource) => string | void) {
  const src = target()
  if (!src) return osd('No camera connected', 'bad')
  if (!has(src)) return osd(`${camName(src)} has no ${what} control`, 'bad')
  const text = fn(src)
  if (text) osd(`${camName(src)} — ${text}`)
}

function set(src: VideoSource, patch: Partial<CamSettings>) {
  changeSettings(src, patch)
}

/** Next marked stop up or down from the current value (like one click of a lens ring). */
function stepStop(stops: Stop[], v: number, dir: 1 | -1) {
  const pos = posOf(stops, v)
  const i = dir > 0 ? Math.floor(pos + 0.001) + 1 : Math.ceil(pos - 0.001) - 1
  return stops[Math.max(0, Math.min(stops.length - 1, i))].v
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const manualNote = (src: VideoSource) => (src.settings.autoExposure ? ' (manual exposure)' : '')

function shutter(dir: 1 | -1) {
  onCam('shutter', (s) => !!s.hw?.shutter && shutterStops(s.hw.shutter).length > 0, (src) => {
    const note = manualNote(src)
    const v = stepStop(shutterStops(src.hw!.shutter!), src.settings.shutter, dir)
    set(src, { shutter: v, autoExposure: false })
    return `Shutter ${shutterLabel(v)} · ${shutterAngle(v, src.hw?.fps ?? store.get().fps)}°${note}`
  })
}

function iso(dir: 1 | -1) {
  onCam('ISO', (s) => !!s.hw?.iso && ISO_STOPS.filter((x) => x.v >= s.hw!.iso![0] && x.v <= s.hw!.iso![1]).length > 1, (src) => {
    const note = manualNote(src)
    const stops = ISO_STOPS.filter((x) => x.v >= src.hw!.iso![0] && x.v <= src.hw!.iso![1])
    const v = stepStop(stops, src.settings.iso, dir)
    set(src, { iso: v, autoExposure: false })
    return `ISO ${v}${note}`
  })
}

function iris(dir: 1 | -1) {
  onCam('iris', (s) => !!s.hw?.aperture && apertureStops(s.hw.aperture).length > 0, (src) => {
    const v = stepStop(apertureStops(src.hw!.aperture!), src.settings.aperture, dir)
    set(src, { aperture: v })
    return `Iris f/${v.toFixed(1)}`
  })
}

function nd(dir: 1 | -1) {
  onCam('ND filter', (s) => !!s.hw?.nd, (src) => {
    const i = Math.max(0, ND_STEPS.indexOf(src.settings.nd))
    const v = ND_STEPS[clamp(i + dir, 0, ND_STEPS.length - 1)]
    set(src, { nd: v })
    return `ND ${ND_LABEL[v]}`
  })
}

function ev(dir: 1 | -1) {
  onCam('exposure', () => true, (src) => {
    // One third of a stop per press, like a camera's exposure dial.
    const v = Math.round(clamp(Math.round(src.settings.exposure * 3) / 3 + dir / 3, -2, 2) * 100) / 100
    set(src, { exposure: v })
    return `Exposure ${v > 0 ? '+' : ''}${v.toFixed(1)} EV`
  })
}

function focus(dir: 1 | -1) {
  onCam('focus', (s) => !!s.hw?.focus, (src) => {
    const v = Math.round(clamp(src.settings.focus + dir * 0.02, 0, 1) * 1000) / 1000
    set(src, { focus: v, autoFocus: false })
    const [a, b] = src.hw!.focus!
    return `Focus ${(a + v * (b - a)).toFixed(2)} m (manual)`
  })
}

function zoom(dir: 1 | -1) {
  onCam('zoom', () => true, (src) => {
    const v = Math.round(clamp(src.settings.zoom + dir * 0.1, 1, 4) * 100) / 100
    set(src, { zoom: v })
    return `Zoom ${v.toFixed(1)}×${src.hw?.zoom ? '' : ' (digital)'}`
  })
}

function wb(dir: 1 | -1) {
  onCam('white balance', () => true, (src) => {
    const [lo, hi] = src.hw?.wb ?? [2800, 7500]
    const v = clamp(Math.round(src.settings.whiteBalance / 100) * 100 + dir * 100, lo, hi)
    set(src, { whiteBalance: v, autoWhiteBalance: false })
    return `White balance ${v} K`
  })
}

function move(dx: number, dy: number) {
  onCam('pan / tilt', () => true, (src) => {
    const pan = Math.round(clamp(src.settings.pan + dx, -1, 1) * 100) / 100
    const tilt = Math.round(clamp(src.settings.tilt + dy, -1, 1) * 100) / 100
    set(src, { pan, tilt })
    return `Pan ${Math.round(pan * 100)} · Tilt ${Math.round(-tilt * 100)}`
  })
}

function selectStep(dir: 1 | -1) {
  const st = store.get()
  const cams = [...st.sources].sort((a, b) => a.number - b.number)
  if (!cams.length) return osd('No camera connected', 'bad')
  const i = cams.findIndex((s) => s.id === st.selected)
  const next = cams[(i + dir + cams.length) % cams.length]
  store.set({ selected: next.id, preview: next.id === st.program ? st.preview : next.id })
  osd(`${camName(next)} selected`)
}

// ------------------------------------------------------------ every action

export const ACTIONS: KeyAction[] = [
  { id: 'record', label: 'Start / stop recording', group: 'switch', def: 'R', run: () => recorder.toggle() },
  { id: 'marker', label: 'Marker', group: 'switch', def: 'M', run: () => recorder.marker() },
  { id: 'slate', label: 'Slate (flash + beep everywhere)', group: 'switch', def: 'S', run: () => recorder.slate() },
  { id: 'cut', label: 'Cut', group: 'switch', def: 'Space', run: () => video.cut() },
  { id: 'auto', label: 'Auto transition', group: 'switch', def: 'Enter', run: () => video.auto() },
  { id: 'ftb', label: 'Fade to black', group: 'switch', def: 'F', run: () => store.set((s) => ({ ftb: !s.ftb })) },
  { id: 'title', label: 'Title (lower third) on / off', group: 'switch', def: 'L', run: () => store.set((s) => ({ lowerThird: { ...s.lowerThird, on: !s.lowerThird.on } })) },
  { id: 'view-grid', label: 'Grid view', group: 'switch', def: 'G', run: () => store.set({ view: 'grid', page: 'live' }) },
  { id: 'view-focus', label: 'Focus view', group: 'switch', def: 'V', run: () => store.set({ view: 'focus', page: 'live' }) },
  { id: 'view-switch', label: 'Switcher view', group: 'switch', def: 'X', run: () => store.set({ view: 'switch', page: 'live' }) },
  { id: 'cam-next', label: 'Select next camera', group: 'switch', def: '.', run: () => selectStep(1) },
  { id: 'cam-prev', label: 'Select previous camera', group: 'switch', def: ',', run: () => selectStep(-1) },

  { id: 'shutter-up', label: 'Shutter faster', group: 'camera', def: 'C', repeat: true, run: () => shutter(1) },
  { id: 'shutter-down', label: 'Shutter slower', group: 'camera', def: 'Shift+C', repeat: true, run: () => shutter(-1) },
  { id: 'iso-up', label: 'ISO up', group: 'camera', def: 'I', repeat: true, run: () => iso(1) },
  { id: 'iso-down', label: 'ISO down', group: 'camera', def: 'Shift+I', repeat: true, run: () => iso(-1) },
  { id: 'ae', label: 'Auto exposure on / off', group: 'camera', def: null, run: () => onCam('exposure mode', (s) => !!(s.hw?.shutter || s.hw?.iso), (src) => {
    set(src, { autoExposure: !src.settings.autoExposure })
    return src.settings.autoExposure ? 'Manual exposure' : 'Auto exposure'
  }) },
  { id: 'ev-up', label: 'Exposure + ⅓ stop', group: 'camera', def: 'E', repeat: true, run: () => ev(1) },
  { id: 'ev-down', label: 'Exposure − ⅓ stop', group: 'camera', def: 'Shift+E', repeat: true, run: () => ev(-1) },
  { id: 'iris-close', label: 'Iris: higher f-number (darker)', group: 'camera', def: 'A', repeat: true, run: () => iris(1) },
  { id: 'iris-open', label: 'Iris: lower f-number (brighter)', group: 'camera', def: 'Shift+A', repeat: true, run: () => iris(-1) },
  { id: 'nd-up', label: 'ND filter stronger', group: 'camera', def: 'N', run: () => nd(1) },
  { id: 'nd-down', label: 'ND filter weaker', group: 'camera', def: 'Shift+N', run: () => nd(-1) },
  { id: 'focus-far', label: 'Focus farther', group: 'camera', def: 'D', repeat: true, run: () => focus(1) },
  { id: 'focus-near', label: 'Focus nearer', group: 'camera', def: 'Shift+D', repeat: true, run: () => focus(-1) },
  { id: 'af', label: 'Autofocus on / off', group: 'camera', def: null, run: () => onCam('focus', (s) => !!s.hw?.focus, (src) => {
    set(src, { autoFocus: !src.settings.autoFocus })
    return src.settings.autoFocus ? 'Manual focus' : 'Autofocus'
  }) },
  { id: 'zoom-in', label: 'Zoom in', group: 'camera', def: 'Z', repeat: true, run: () => zoom(1) },
  { id: 'zoom-out', label: 'Zoom out', group: 'camera', def: 'Shift+Z', repeat: true, run: () => zoom(-1) },
  { id: 'wb-up', label: 'White balance + 100 K', group: 'camera', def: 'W', repeat: true, run: () => wb(1) },
  { id: 'wb-down', label: 'White balance − 100 K', group: 'camera', def: 'Shift+W', repeat: true, run: () => wb(-1) },
  { id: 'awb', label: 'Auto white balance on / off', group: 'camera', def: null, run: () => onCam('white balance', () => true, (src) => {
    set(src, { autoWhiteBalance: !src.settings.autoWhiteBalance })
    return src.settings.autoWhiteBalance ? 'Manual white balance' : 'Auto white balance'
  }) },
  { id: 'pan-left', label: 'Pan left', group: 'camera', def: null, repeat: true, run: () => move(-0.03, 0) },
  { id: 'pan-right', label: 'Pan right', group: 'camera', def: null, repeat: true, run: () => move(0.03, 0) },
  { id: 'tilt-up', label: 'Tilt up', group: 'camera', def: null, repeat: true, run: () => move(0, -0.03) },
  { id: 'tilt-down', label: 'Tilt down', group: 'camera', def: null, repeat: true, run: () => move(0, 0.03) },
  { id: 'torch', label: 'Torch on / off', group: 'camera', def: null, run: () => onCam('torch', (s) => !!s.hw?.torch, (src) => {
    set(src, { torch: !src.settings.torch })
    return src.settings.torch ? 'Torch off' : 'Torch on'
  }) },
]

// ------------------------------------------------------------ bindings

/** Keys that keep a fixed meaning: 1–9 select a camera, Shift + 1–9 cut it to program. */
export const RESERVED = /^(Shift\+)?[1-9]$/
const STORE_KEY = 'cortiva:keys'

type Bindings = Record<string, string | null>
const defaults = (): Bindings => Object.fromEntries(ACTIONS.map((a) => [a.id, a.def]))

function load(): Bindings {
  const b = defaults()
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as unknown
    if (saved && typeof saved === 'object') {
      for (const [id, k] of Object.entries(saved)) {
        if (!(id in b)) continue
        if (k === null || (typeof k === 'string' && k.length <= 32 && !RESERVED.test(k))) b[id] = k
      }
    }
  } catch {
    // storage blocked or corrupt: defaults
  }
  // A key can only do one thing: if two actions ended up sharing one, the first keeps it.
  const seen = new Set<string>()
  for (const a of ACTIONS) {
    const k = b[a.id]
    if (k && seen.has(k)) b[a.id] = null
    else if (k) seen.add(k)
  }
  return b
}

let bindings: Bindings = load()
const listeners = new Set<() => void>()

function save() {
  const d = defaults()
  const changed = Object.fromEntries(Object.entries(bindings).filter(([id, k]) => d[id] !== k))
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(changed))
  } catch {
    // not saved; still works until the app closes
  }
  listeners.forEach((l) => l())
}

export function useBindings() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => bindings,
  )
}

/** Give an action a key. Returns the action that lost that key, if any. */
export function bind(id: string, key: string | null): KeyAction | null {
  if (key && RESERVED.test(key)) return null
  let lost: KeyAction | null = null
  const next = { ...bindings }
  if (key) {
    for (const a of ACTIONS) {
      if (a.id !== id && next[a.id] === key) {
        next[a.id] = null
        lost = a
      }
    }
  }
  next[id] = key
  bindings = next
  save()
  return lost
}

export function resetBindings() {
  bindings = defaults()
  save()
}

// ------------------------------------------------------------ reading keys

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock', 'Dead', 'Unidentified', 'Process', 'Fn'])

/** "C", "Shift+C", "Space", "ArrowUp", "," … or null for keys that can't be bound. */
export function comboOf(e: KeyboardEvent): string | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  if (MODIFIERS.has(e.key)) return null
  let name: string
  if (/^Key[A-Z]$/.test(e.code)) name = e.key.length === 1 ? e.key.toUpperCase() : e.code.slice(3)
  else if (/^Digit[0-9]$/.test(e.code)) name = e.code.slice(5)
  else if (e.key === ' ') name = 'Space'
  else if (e.key.length === 1) name = e.key.toUpperCase()
  else name = e.key
  return e.shiftKey ? `Shift+${name}` : name
}

const PRETTY: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', Backspace: '⌫' }
export const prettyKey = (k: string) =>
  k
    .split('+')
    .map((p) => PRETTY[p] ?? p)
    .join(' + ')

/** While the Setup page is waiting for a new key, shortcuts are off. */
export let capturing = false
export function setCapturing(on: boolean) {
  capturing = on
}

/** Run whatever the pressed key is bound to. True if it did something. */
export function handleKey(e: KeyboardEvent): boolean {
  if (capturing) return false
  const combo = comboOf(e)
  if (!combo) return false
  const st = store.get()
  const digit = /^(Shift\+)?([1-9])$/.exec(combo)
  if (digit) {
    const src = st.sources.find((s) => s.number === Number(digit[2]))
    if (!src) return false
    if (digit[1]) video.hotCut(src.id)
    else store.set({ selected: src.id, preview: src.id === st.program ? st.preview : src.id })
    return true
  }
  const action = ACTIONS.find((a) => bindings[a.id] === combo)
  if (!action) return false
  if (e.repeat && !action.repeat) return true
  action.run()
  return true
}
