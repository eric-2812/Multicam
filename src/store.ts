import { useRef, useSyncExternalStore } from 'react'
import type { Fps, TcMode } from './engine/timecode'
import type { Accessory, AudioChannel, Toast, TransitionType, VideoSource } from './types'

export interface LowerThird {
  on: boolean
  title: string
  subtitle: string
}

export type Page = 'live' | 'setup' | 'takes'
export type SetupSection = 'project' | 'devices' | 'recording' | 'sync' | 'audio' | 'shortcuts'
export type View = 'grid' | 'focus' | 'switch'
export type AddTab = 'usb' | 'phone' | 'url' | 'bluetooth' | 'screen'
export type Guides = 'off' | 'thirds' | 'safe' | 'center' | 'scope'

export interface Monitoring {
  zebra: boolean
  /** Zebra threshold, % luminance. */
  zebraLevel: number
  peaking: boolean
  guides: Guides
  histogram: boolean
}

export interface RecConfig {
  /** Write straight into a folder (Chrome/Edge) or download each file when the take ends. */
  dest: 'folder' | 'downloads'
  folderName: string | null
  format: 'mp4' | 'webm'
  quality: 'low' | 'med' | 'high'
  /** Each microphone to its own audio file. */
  mics: boolean
  /** The switched program (with the mix) as well. */
  program: boolean
  /** EDL, marker CSV and a JSON take sheet. */
  sidecar: boolean
  /** Put the program mix on every camera file, for waveform sync in the edit. */
  scratch: boolean
  /** Phones also record locally at full quality. */
  phoneLocal: boolean
}

export interface TakeFile {
  name: string
  kind: 'camera' | 'audio' | 'program' | 'sidecar' | 'phone'
  bytes: number
}

export interface Take {
  number: number
  name: string
  startMs: number
  endMs: number | null
  files: TakeFile[]
  markers: number
  dest: string
}

export interface State {
  started: boolean
  demo: boolean
  page: Page
  setupSection: SetupSection
  addTab: AddTab
  view: View
  monitor: Monitoring
  /** Tablet: camera settings drawer. */
  inspectorOpen: boolean
  /** Phone: which panel fills the screen. */
  mobileTab: 'cams' | 'camera' | 'audio'
  mixerOpen: boolean
  sources: VideoSource[]
  channels: AudioChannel[]
  accessories: Accessory[]
  program: string | null
  preview: string | null
  /** Camera shown in the inspector and the focus view. */
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
  fps: Fps
  tcMode: TcMode
  /** Burn the master timecode into the program picture. */
  burnIn: boolean
  project: { name: string; take: number; notes: string }
  rec: RecConfig
  takes: Take[]
}

const initial: State = {
  started: false,
  demo: false,
  page: 'live',
  setupSection: 'project',
  addTab: 'usb',
  view: 'grid',
  monitor: { zebra: false, zebraLevel: 95, peaking: false, guides: 'off', histogram: true },
  inspectorOpen: false,
  mobileTab: 'cams',
  mixerOpen: true,
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
  fps: 30,
  tcMode: 'tod',
  burnIn: false,
  project: { name: 'Untitled', take: 1, notes: '' },
  rec: {
    dest: 'downloads',
    folderName: null,
    format: 'mp4',
    quality: 'med',
    mics: true,
    program: true,
    sidecar: true,
    scratch: true,
    phoneLocal: true,
  },
  takes: [],
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
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => Object.is(x, b[i]))
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    return ka.length === kb.length && ka.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  }
  return false
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
    sources: [...s.sources, { ...src, number: src.number || freeNumber(s.sources) }],
    program: s.program ?? src.id,
    preview: s.preview ?? (s.program ? src.id : null),
    selected: s.selected ?? src.id,
  }))
}

export function addChannel(ch: AudioChannel) {
  store.set((s) => ({ channels: [...s.channels, ch] }))
}

/** Lowest camera number not already taken. */
export function freeNumber(sources: VideoSource[]) {
  const used = new Set(sources.map((s) => s.number))
  let n = 1
  while (used.has(n)) n++
  return n
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
