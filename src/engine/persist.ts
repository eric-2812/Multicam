import { store, toast, updateChannel, updateSource, type RecConfig, type State } from '../store'
import type { AudioChannel, CamSettings, ChannelFx, PtzPreset, RecSettings, TransitionType, VideoSource } from '../types'
import { DEFAULT_FX, DEFAULT_SETTINGS } from '../types'
import { addMic, addUrlCamera, addWebcam, applyHardware, listDevices, unlockDevices } from './devices'
import { setFolder } from './recorder'

/**
 * Remembers the setup between sessions, on this computer only (browser storage): project and
 * recording settings straight away, and the cameras and microphones — with their names, numbers
 * and settings — when the user chooses "Restore" on the welcome screen. Phones, screen shares and
 * Bluetooth cameras have to be connected again (the browser needs the person to do that).
 */

const KEY = 'cortiva:setup'

interface SavedCam {
  kind: 'webcam' | 'url'
  deviceId?: string
  label: string
  quality?: '720' | '1080' | '4k'
  url?: string
  name: string
  number: number
  settings: CamSettings
  rec: RecSettings
  delay: number
  presets: (PtzPreset | null)[]
}

interface SavedMic {
  deviceId?: string
  label: string
  name: string
  gain: number
  pan: number
  muted: boolean
  delay: number
  fx: ChannelFx
  /** Audio-follows-video, by camera number. */
  afv: number | null
}

export interface SavedSetup {
  v: 1
  savedAt: number
  project: State['project']
  rec: RecConfig
  fps: State['fps']
  tcMode: State['tcMode']
  burnIn: boolean
  transition: TransitionType
  duration: number
  lowerThird: { title: string; subtitle: string }
  monitor: State['monitor']
  master: number
  cams: SavedCam[]
  mics: SavedMic[]
}

function snapshot(s: State): SavedSetup {
  const num = (id: string | null) => s.sources.find((x) => x.id === id)?.number ?? null
  return {
    v: 1,
    savedAt: Date.now(),
    project: s.project,
    rec: s.rec,
    fps: s.fps,
    tcMode: s.tcMode,
    burnIn: s.burnIn,
    transition: s.transition,
    duration: s.duration,
    lowerThird: { title: s.lowerThird.title, subtitle: s.lowerThird.subtitle },
    monitor: s.monitor,
    master: s.master,
    cams: s.sources
      .filter((x): x is VideoSource & { kind: 'webcam' | 'url' } => x.kind === 'webcam' || (x.kind === 'url' && !!x.url))
      .map((x) => ({
        kind: x.kind,
        deviceId: x.deviceId,
        label: x.detail,
        quality: x.quality,
        url: x.url,
        name: x.name,
        number: x.number,
        settings: x.settings,
        rec: x.rec,
        delay: x.delay,
        presets: x.presets,
      })),
    mics: s.channels
      .filter((c) => c.kind === 'mic')
      .map((c) => ({ deviceId: c.deviceId, label: c.detail, name: c.name, gain: c.gain, pan: c.pan, muted: c.muted, delay: c.delay, fx: c.fx, afv: num(c.afv) })),
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The last saved setup, or null. Anything that doesn't look right is ignored. */
export function loadSaved(): SavedSetup | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as unknown
    if (!isObj(v) || v.v !== 1 || !Array.isArray(v.cams) || !Array.isArray(v.mics) || !isObj(v.project) || !isObj(v.rec)) return null
    return v as unknown as SavedSetup
  } catch {
    return null
  }
}

export function forgetSaved() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // nothing saved
  }
}

/** Put back the project and recording settings (not devices) at start-up. */
export function restoreSettings() {
  const v = loadSaved()
  if (!v) return
  store.set((s) => ({
    project: { ...s.project, ...v.project },
    rec: { ...s.rec, ...v.rec },
    fps: v.fps === 25 || v.fps === 30 ? v.fps : s.fps,
    tcMode: v.tcMode ?? s.tcMode,
    burnIn: !!v.burnIn,
    transition: v.transition ?? s.transition,
    duration: typeof v.duration === 'number' ? v.duration : s.duration,
    lowerThird: { ...s.lowerThird, ...v.lowerThird, on: false },
    monitor: { ...s.monitor, ...v.monitor },
    master: typeof v.master === 'number' ? v.master : s.master,
  }))
}

let timer = 0
/** Whether this session has had any device yet: until then the saved devices are kept, not erased. */
let hadDevices = false
/** Save whenever something changes (a moment later, so dragging a fader doesn't write 60 times a second). */
export function startSaving() {
  store.subscribe(() => {
    const st = store.get()
    if (!st.started) return
    if (st.sources.length || st.channels.length) hadDevices = true
    clearTimeout(timer)
    timer = window.setTimeout(() => {
      try {
        const next = snapshot(store.get())
        const prev = loadSaved()
        if (!hadDevices && prev) {
          next.cams = prev.cams
          next.mics = prev.mics
        }
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // storage full or blocked: keep working, just without remembering
      }
    }, 800)
  })
}

/** One line for the welcome screen: what would be reconnected. */
export function describe(v: SavedSetup) {
  const parts = [...v.cams.map((c) => c.name), ...v.mics.map((m) => m.name)]
  return parts.length > 4 ? `${parts.slice(0, 4).join(', ')} and ${parts.length - 4} more` : parts.join(', ')
}

/** Reconnect the saved cameras and microphones and give them back their names and settings. */
export async function restoreDevices(v: SavedSetup) {
  if (v.cams.some((c) => c.kind === 'webcam') || v.mics.length) {
    try {
      await unlockDevices()
    } catch {
      toast('Camera and microphone access was not allowed, so they could not be reconnected.', 'bad')
    }
  }
  const { cams, mics } = await listDevices().catch(() => ({ cams: [] as MediaDeviceInfo[], mics: [] as MediaDeviceInfo[] }))
  const ids = new Map<number, string>()
  const missing: string[] = []

  for (const c of [...v.cams].sort((a, b) => a.number - b.number)) {
    try {
      let id: string
      if (c.kind === 'url' && c.url) id = addUrlCamera(c.name, c.url)
      else {
        // Same device id if the browser kept it; otherwise the same name.
        const dev = cams.find((d) => d.deviceId === c.deviceId) ?? cams.find((d) => d.label === c.label)
        if (!dev) {
          missing.push(c.name)
          continue
        }
        id = await addWebcam(dev, c.quality ?? '1080')
      }
      ids.set(c.number, id)
      const taken = store.get().sources.some((s) => s.id !== id && s.number === c.number)
      updateSource(id, {
        name: c.name,
        ...(taken ? {} : { number: c.number }),
        settings: { ...DEFAULT_SETTINGS, ...c.settings },
        rec: c.rec,
        delay: c.delay ?? 0,
        presets: c.presets,
      })
      const src = store.get().sources.find((s) => s.id === id)
      if (src) applyHardware(src)
    } catch {
      missing.push(c.name)
    }
  }

  for (const m of v.mics) {
    const dev = mics.find((d) => d.deviceId === m.deviceId) ?? mics.find((d) => d.label === m.label)
    if (!dev) {
      missing.push(m.name)
      continue
    }
    try {
      const id = await addMic(dev)
      const patch: Partial<AudioChannel> = {
        name: m.name,
        gain: m.gain,
        pan: m.pan,
        muted: m.muted,
        delay: m.delay ?? 0,
        fx: { ...DEFAULT_FX, ...m.fx },
        afv: m.afv != null ? (ids.get(m.afv) ?? null) : null,
      }
      updateChannel(id, patch)
    } catch {
      missing.push(m.name)
    }
  }

  if (missing.length) toast(`Not connected: ${missing.join(', ')}. Plug them in and add them from Setup → Devices.`, 'bad')
  else toast('Last setup restored', 'good')
}

// ------------------------------------------------------------ recording folder
// The folder chosen for recordings is remembered too (Chrome and Edge only). The browser asks
// again for permission to write in it at the first REC.

const DB = 'cortiva'
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore('handles')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

export async function saveFolder(handle: unknown) {
  try {
    const d = await db()
    d.transaction('handles', 'readwrite').objectStore('handles').put(handle, 'folder')
  } catch {
    // not remembered; the folder still works this session
  }
}

export async function restoreFolder() {
  try {
    if (store.get().rec.dest !== 'folder') return
    const d = await db()
    const handle = await new Promise<unknown>((res, rej) => {
      const r = d.transaction('handles').objectStore('handles').get('folder')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    if (handle) setFolder(handle)
  } catch {
    // no folder remembered
  }
}
