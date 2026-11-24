import { useRef, useSyncExternalStore } from 'react'
import type { Accessory, AudioChannel, Toast, TransitionType, VideoSource } from './types'

export interface LowerThird {
  on: boolean
  title: string
  subtitle: string
}

export interface State {
  started: boolean
  demo: boolean
  sources: VideoSource[]
  channels: AudioChannel[]
  accessories: Accessory[]
  program: string | null
  preview: string | null
  /** Source shown in the inspector. */
  selected: string | null
  transition: TransitionType
  duration: number // ms
  /** 0..1 while a transition runs (auto or T-bar). */
  tbar: number
  transitioning: boolean
  ftb: boolean
  lowerThird: LowerThird
  recordingSince: number | null
  /** Play the master bus through the speakers. */
  listen: boolean
  master: number
  toasts: Toast[]
  addOpen: boolean
  addTab: AddTab
}

export type AddTab = 'usb' | 'phone' | 'url' | 'bluetooth' | 'screen'

const initial: State = {
  started: false,
  demo: false,
  sources: [],
  channels: [],
  accessories: [],
  program: null,
  preview: null,
  selected: null,
  transition: 'mix',
  duration: 800,
  tbar: 0,
  transitioning: false,
  ftb: false,
  lowerThird: { on: false, title: 'Alex Rivera', subtitle: 'Host · Morning Sessions' },
  recordingSince: null,
  listen: false,
  master: 0.9,
  toasts: [],
  addOpen: false,
  addTab: 'usb',
}

let state: State = initial
const listeners = new Set<() => void>()

export const store = {
  get: () => state,
  set(patch: Partial<State> | ((s: State) => Partial<State>)) {
    const p = typeof patch === 'function' ? patch(state) : patch
    state = { ...state, ...p }
    listeners.forEach((l) => l())
  },
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}

function same(a: unknown, b: unknown) {
  if (Object.is(a, b)) return true
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
  return a.every((x, i) => Object.is(x, b[i]))
}

/** Subscribe to a slice of state. Selectors may return fresh arrays; they're compared shallowly. */
export function useStore<T>(sel: (s: State) => T): T {
  const last = useRef<{ v: T } | null>(null)
  return useSyncExternalStore(store.subscribe, () => {
    const v = sel(state)
    if (last.current && same(last.current.v, v)) return last.current.v
    last.current = { v }
    return v
  })
}

// ---------- actions ----------

export function updateSource(id: string, patch: Partial<VideoSource>) {
  store.set((s) => ({ sources: s.sources.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
}

export function updateSettings(id: string, patch: Partial<VideoSource['settings']>) {
  store.set((s) => ({
    sources: s.sources.map((x) => (x.id === id ? { ...x, settings: { ...x.settings, ...patch } } : x)),
  }))
}

export function updateChannel(id: string, patch: Partial<AudioChannel>) {
  store.set((s) => ({ channels: s.channels.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
}

export function addSource(src: VideoSource) {
  store.set((s) => ({
    sources: [...s.sources, src],
    program: s.program ?? src.id,
    preview: s.preview ?? (s.program ? src.id : null),
    selected: s.selected ?? src.id,
  }))
}

export function addChannel(ch: AudioChannel) {
  store.set((s) => ({ channels: [...s.channels, ch] }))
}

let toastId = 1
export function toast(text: string, tone: Toast['tone'] = 'info') {
  const id = toastId++
  store.set((s) => ({ toasts: [...s.toasts, { id, text, tone }].slice(-4) }))
  setTimeout(() => store.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4200)
}

export function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}
