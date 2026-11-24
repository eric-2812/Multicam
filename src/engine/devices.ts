import { addChannel, addSource, store, toast, uid, updateSource } from '../store'
import { DEFAULT_FX, DEFAULT_SETTINGS, type RawCap, type AudioChannel, type HwCaps, type Link, type VideoSource } from '../types'
import { audio } from './audio'
import { sendToPhone } from './phone'
import { video } from './video'

export const BT_HINT = /bluetooth|airpods|buds|hands-?free|headset|\bbt\b|beats|jabra|bose|sony wh|wireless/i

export function guessLink(label: string, fallback: Link = 'usb'): Link {
  if (BT_HINT.test(label)) return 'bluetooth'
  if (/facetime|built-?in|integrated|internal|macbook|front|back camera|rear/i.test(label)) return 'builtin'
  if (/continuity|iphone|android|droidcam|wi-?fi|network|ndi|obs virtual/i.test(label)) return 'wifi'
  return fallback
}

export function newSource(p: Partial<VideoSource> & Pick<VideoSource, 'name' | 'kind' | 'link' | 'detail'>): VideoSource {
  return {
    id: uid('cam'),
    ptz: false,
    // Real cameras start on their own auto white balance; simulated lenses start at 5600 K.
    settings: { ...DEFAULT_SETTINGS, autoWhiteBalance: p.kind !== 'demo' },
    presets: [null, null, null, null, null, null],
    status: 'live',
    delay: 0,
    rec: { armed: true, feed: p.kind === 'demo' || p.kind === 'url' ? 'processed' : 'clean' },
    number: 0,
    ...p,
  }
}


export function newChannel(p: Partial<AudioChannel> & Pick<AudioChannel, 'name' | 'kind' | 'link' | 'detail'>): AudioChannel {
  return { id: uid('mic'), gain: 1, pan: 0, muted: false, solo: false, afv: null, status: 'live', delay: 0, fx: { ...DEFAULT_FX }, ...p }
}

export function mediaSupported() {
  return !!navigator.mediaDevices?.getUserMedia
}

/** Ask for permission once so that enumerateDevices returns labels. */
export async function unlockDevices() {
  const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }).catch(() =>
    navigator.mediaDevices.getUserMedia({ video: true }).catch(() => navigator.mediaDevices.getUserMedia({ audio: true })),
  )
  s.getTracks().forEach((t) => t.stop())
}

export async function listDevices() {
  const all = await navigator.mediaDevices.enumerateDevices()
  return {
    cams: all.filter((d) => d.kind === 'videoinput'),
    mics: all.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications'),
  }
}

type Range = { min: number; max: number }
type ExtCaps = MediaTrackCapabilities & {
  zoom?: Range
  torch?: boolean
  focusDistance?: Range
  focusMode?: string[]
  exposureTime?: Range
  exposureMode?: string[]
  iso?: Range
  colorTemperature?: Range
  whiteBalanceMode?: string[]
  exposureCompensation?: Range
  sharpness?: Range
  width?: Range
  height?: Range
  frameRate?: Range
}

const STD_MODES = [
  { w: 3840, h: 2160 },
  { w: 2560, h: 1440 },
  { w: 1920, h: 1080 },
  { w: 1280, h: 720 },
  { w: 640, h: 360 },
]
const STD_FPS = [24, 25, 30, 50, 60]

/** Read what the camera lets us control. Used locally and by the phone page. */
export function capsOf(track: MediaStreamTrack): HwCaps {
  const set = track.getSettings()
  const hw: HwCaps = { width: set.width, height: set.height, fps: set.frameRate ? Math.round(set.frameRate) : undefined }
  const caps = (track.getCapabilities?.() ?? {}) as ExtCaps
  if (caps.zoom && caps.zoom.max > caps.zoom.min) hw.zoom = [caps.zoom.min, caps.zoom.max]
  if (caps.torch) hw.torch = true
  if (caps.focusDistance && caps.focusDistance.max > caps.focusDistance.min && caps.focusMode?.includes('manual')) {
    hw.focus = [caps.focusDistance.min, caps.focusDistance.max]
  }
  // exposureTime is in units of 100 µs; convert to a 1/x shutter range.
  if (caps.exposureTime && caps.exposureTime.max > caps.exposureTime.min && caps.exposureMode?.includes('manual')) {
    hw.shutter = [Math.max(1, 10000 / caps.exposureTime.max), 10000 / Math.max(caps.exposureTime.min, 0.01)]
  }
  if (caps.iso && caps.iso.max > caps.iso.min) hw.iso = [caps.iso.min, caps.iso.max]
  if (caps.colorTemperature && caps.colorTemperature.max > caps.colorTemperature.min && caps.whiteBalanceMode?.includes('manual')) {
    hw.wb = [caps.colorTemperature.min, caps.colorTemperature.max]
  }
  if (caps.exposureCompensation && caps.exposureCompensation.max > caps.exposureCompensation.min) {
    hw.ev = [caps.exposureCompensation.min, caps.exposureCompensation.max]
  }
  if (caps.sharpness && caps.sharpness.max > caps.sharpness.min) hw.sharpness = [caps.sharpness.min, caps.sharpness.max]
  const range = (r?: Range) => (r && r.max > r.min ? ([r.min, r.max] as [number, number]) : undefined)
  hw.pan = range((caps as { pan?: Range }).pan)
  hw.tilt = range((caps as { tilt?: Range }).tilt)
  // Keep the full report (JSON-safe) so every setting the camera offers can be shown.
  const raw: Record<string, RawCap> = {}
  for (const [k, v] of Object.entries(caps)) {
    if (Array.isArray(v) || typeof v === 'boolean') raw[k] = v as RawCap
    else if (v && typeof v === 'object' && 'min' in v && 'max' in v) raw[k] = { min: (v as Range).min, max: (v as Range).max, step: (v as { step?: number }).step }
  }
  hw.raw = { caps: raw, settings: JSON.parse(JSON.stringify(set)) }
  if (caps.width?.max && caps.height?.max) {
    const maxFps = caps.frameRate?.max ?? 30
    const fps = STD_FPS.filter((f) => f <= maxFps + 0.5)
    hw.modes = STD_MODES.filter((m) => m.w <= caps.width!.max && m.h <= caps.height!.max).map((m) => ({ ...m, fps: fps.length ? fps : [30] }))
  }
  return hw
}

/** Track constraints that put the camera's own zoom / focus / shutter / torch where the UI says. */
export function hwConstraints(src: VideoSource): Record<string, unknown> {
  const hw = src.hw ?? {}
  const s = src.settings
  const c: Record<string, unknown> = {}
  if (hw.zoom) c.zoom = hw.zoom[0] + ((s.zoom - 1) / 3) * (hw.zoom[1] - hw.zoom[0])
  if (hw.pan) c.pan = hw.pan[0] + ((s.pan + 1) / 2) * (hw.pan[1] - hw.pan[0])
  if (hw.tilt) c.tilt = hw.tilt[0] + ((-s.tilt + 1) / 2) * (hw.tilt[1] - hw.tilt[0])
  if (hw.torch) c.torch = s.torch
  if (hw.focus) {
    if (s.autoFocus) c.focusMode = 'continuous'
    else {
      c.focusMode = 'manual'
      c.focusDistance = hw.focus[0] + s.focus * (hw.focus[1] - hw.focus[0])
    }
  }
  if (hw.shutter || hw.iso) {
    if (s.autoExposure) c.exposureMode = 'continuous'
    else {
      c.exposureMode = 'manual'
      if (hw.shutter) c.exposureTime = 10000 / s.shutter
      if (hw.iso) c.iso = Math.max(hw.iso[0], Math.min(hw.iso[1], s.iso))
    }
  }
  if (hw.ev) c.exposureCompensation = Math.max(hw.ev[0], Math.min(hw.ev[1], s.exposure))
  if (hw.wb) {
    if (s.autoWhiteBalance) c.whiteBalanceMode = 'continuous'
    else {
      c.whiteBalanceMode = 'manual'
      c.colorTemperature = Math.max(hw.wb[0], Math.min(hw.wb[1], s.whiteBalance))
    }
  }
  if (hw.sharpness) c.sharpness = hw.sharpness[0] + s.sharpness * (hw.sharpness[1] - hw.sharpness[0])
  return c
}

function watchEnded(id: string, track: MediaStreamTrack, name: string) {
  track.addEventListener('ended', () => {
    updateSource(id, { status: 'lost' })
    toast(`${name} disconnected`, 'bad')
  })
}

/** Open a camera asking for PTZ access too — Chrome only reports pan / tilt / zoom when asked. */
export async function openCameraStream(video: MediaTrackConstraints) {
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { ...video, pan: true, tilt: true, zoom: true } as MediaTrackConstraints, audio: false })
  } catch (e) {
    if ((e as DOMException).name === 'NotAllowedError') throw e
    return navigator.mediaDevices.getUserMedia({ video, audio: false })
  }
}

export async function addWebcam(device: MediaDeviceInfo, quality: '720' | '1080' | '4k') {
  const h = quality === '4k' ? 2160 : quality === '1080' ? 1080 : 720
  const stream = await openCameraStream({ deviceId: { exact: device.deviceId }, height: { ideal: h }, width: { ideal: (h * 16) / 9 }, frameRate: { ideal: 30 } })
  const track = stream.getVideoTracks()[0]
  const name = device.label || 'Camera'
  const link = guessLink(name)
  const src = newSource({ name: shortName(name), kind: 'webcam', link, detail: name, hw: capsOf(track), ...estimate(link) })
  video.attachStream(src.id, stream)
  watchEnded(src.id, track, src.name)
  addSource(src)
  toast(`${src.name} connected`, 'good')
}

export async function addMic(device: MediaDeviceInfo) {
  audio.ensure()
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: { exact: device.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  })
  const label = device.label || 'Microphone'
  const link = guessLink(label)
  // Browsers report the input buffer latency; Bluetooth adds its own codec delay on top.
  const base = ((stream.getAudioTracks()[0].getSettings() as { latency?: number }).latency ?? 0.01) * 1000
  const ch = newChannel({
    name: shortName(label),
    kind: 'mic',
    link,
    detail: label,
    latency: Math.round(base + (link === 'bluetooth' ? 160 : 5)),
    latencyKind: 'estimated',
  })
  audio.addStream(ch.id, stream)
  stream.getAudioTracks()[0].addEventListener('ended', () => {
    store.set((s) => ({ channels: s.channels.map((c) => (c.id === ch.id ? { ...c, status: 'lost' } : c)) }))
    toast(`${ch.name} disconnected`, 'bad')
  })
  addChannel(ch)
  toast(`${ch.name} added to the mixer`, 'good')
}

export async function addScreen() {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true })
  const track = stream.getVideoTracks()[0]
  const src = newSource({ name: 'Screen', kind: 'screen', link: 'screen', detail: track.label || 'Shared screen', hw: capsOf(track), ...estimate('screen') })
  video.attachStream(src.id, stream)
  watchEnded(src.id, track, 'Screen share')
  addSource(src)
  if (stream.getAudioTracks().length) {
    audio.ensure()
    const ch = newChannel({ name: 'Screen audio', kind: 'screen', link: 'screen', detail: 'System / tab audio' })
    audio.addStream(ch.id, new MediaStream(stream.getAudioTracks()))
    addChannel(ch)
  }
  toast('Screen share added', 'good')
}

export function addUrlCamera(name: string, url: string) {
  const asVideo = /\.(mp4|webm|mov|m3u8|ogv)(\?|$)/i.test(url)
  const src = newSource({ name: name || 'IP camera', kind: 'url', link: 'network', detail: url, ...estimate('network') })
  addSource(src)
  video.attachUrl(
    src.id,
    url,
    asVideo,
    () => {
      updateSource(src.id, { status: 'lost' })
      toast(`${src.name}: could not load the stream`, 'bad')
    },
    () => updateSource(src.id, { tainted: true }),
  )
}

/** Push hardware settings to a real camera (local track, or a phone over its data channel). */
/**
 * Cameras take a moment to apply constraints, and joystick / ring drags fire every frame, so
 * hardware updates are throttled per camera (latest value always wins).
 */
const hwTimers = new Map<string, { last: number; timer: number }>()
export function applyHardware(src: VideoSource) {
  if (src.kind === 'demo') return
  const t = hwTimers.get(src.id) ?? { last: 0, timer: 0 }
  hwTimers.set(src.id, t)
  clearTimeout(t.timer)
  const wait = Math.max(0, 90 - (performance.now() - t.last))
  t.timer = window.setTimeout(() => {
    t.last = performance.now()
    const cur = store.get().sources.find((s) => s.id === src.id)
    if (cur) applyNow(cur)
  }, wait)
}

function applyNow(src: VideoSource) {
  const c = hwConstraints(src)
  if (!Object.keys(c).length) return
  if (src.kind === 'phone') {
    sendToPhone(src.id, { type: 'hw', c })
    return
  }
  const track = video.getStream(src.id)?.getVideoTracks()[0]
  track
    ?.applyConstraints({ advanced: [c as MediaTrackConstraintSet] })
    .catch(() => {})
    .then(() => refreshCaps(src.id, track))
}

/**
 * Set any single hardware control the camera reported (brightness, pan, background blur…),
 * then read back what the camera actually applied.
 */
export async function setRawControl(src: VideoSource, key: string, value: unknown) {
  if (src.kind === 'phone') {
    sendToPhone(src.id, { type: 'hw', c: { [key]: value } })
    return
  }
  const track = video.getStream(src.id)?.getVideoTracks()[0]
  if (!track) return
  try {
    await track.applyConstraints({ advanced: [{ [key]: value } as MediaTrackConstraintSet] })
  } catch {
    toast(`${src.name}: the camera refused that ${key} value`, 'bad')
  }
  refreshCaps(src.id, track)
}

/** Re-read a local camera's capabilities and current values into the store. */
export function refreshCaps(id: string, track: MediaStreamTrack) {
  const cur = store.get().sources.find((s) => s.id === id)
  if (!cur) return
  const fresh = capsOf(track)
  updateSource(id, { hw: { ...cur.hw, raw: fresh.raw, width: fresh.width, height: fresh.height, fps: fresh.fps } })
}

/** Switch a camera's resolution / frame rate. Simulated cameras just relabel. */
export async function setMode(src: VideoSource, w: number, h: number, fps: number) {
  const hw = { ...src.hw, width: w, height: h, fps }
  if (src.kind === 'demo') return updateSource(src.id, { hw })
  if (src.kind === 'phone') {
    sendToPhone(src.id, { type: 'hw', c: { width: w, height: h, frameRate: fps } })
    return updateSource(src.id, { hw })
  }
  const track = video.getStream(src.id)?.getVideoTracks()[0]
  if (!track) return
  try {
    await track.applyConstraints({ width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: fps } })
    const set = track.getSettings()
    updateSource(src.id, { hw: { ...hw, width: set.width, height: set.height, fps: set.frameRate ? Math.round(set.frameRate) : fps } })
  } catch (e) {
    toast(`${src.name}: the camera refused ${w}×${h} at ${fps} fps`, 'bad')
  }
}

export function removeSource(id: string) {
  video.remove(id)
  store.set((s) => {
    const sources = s.sources.filter((x) => x.id !== id)
    const first = sources[0]?.id ?? null
    const program = s.program === id ? (s.preview !== id ? s.preview : null) ?? first : s.program
    let preview = s.preview === id ? null : s.preview
    if (preview === program) preview = null
    if (!preview) preview = sources.find((x) => x.id !== program)?.id ?? null
    return {
      sources,
      program,
      preview,
      selected: s.selected === id ? program : s.selected,
      channels: s.channels.map((c) => (c.afv === id ? { ...c, afv: null } : c)),
    }
  })
}

export function removeChannel(id: string) {
  audio.remove(id)
  store.set((s) => ({ channels: s.channels.filter((c) => c.id !== id) }))
}

// ------------------------------------------------------------ Bluetooth LE

type BTDevice = { name?: string; id: string; gatt?: { connect(): Promise<BTServer> }; addEventListener(t: string, f: () => void): void }
type BTServer = { getPrimaryService(s: string): Promise<{ getCharacteristic(c: string): Promise<{ readValue(): Promise<DataView> }> }> }

export function bluetoothSupported() {
  return 'bluetooth' in navigator
}

/** Pair a BLE accessory (camera remote, gimbal, lav transmitter…) and read its battery. */
export async function scanBluetooth() {
  const bt = (navigator as unknown as { bluetooth: { requestDevice(o: object): Promise<BTDevice> } }).bluetooth
  const dev = await bt.requestDevice({ acceptAllDevices: true, optionalServices: ['battery_service', 'device_information'] })
  const id = uid('bt')
  const name = dev.name || 'Bluetooth device'
  store.set((s) => ({ accessories: [...s.accessories, { id, name, detail: 'Bluetooth LE', link: 'bluetooth', status: 'connected' }] }))
  dev.addEventListener('gattserverdisconnected', () => {
    store.set((s) => ({ accessories: s.accessories.map((a) => (a.id === id ? { ...a, status: 'lost' } : a)) }))
    toast(`${name} disconnected`, 'bad')
  })
  try {
    const server = await dev.gatt!.connect()
    const svc = await server.getPrimaryService('battery_service')
    const ch = await svc.getCharacteristic('battery_level')
    const v = await ch.readValue()
    const battery = v.getUint8(0)
    store.set((s) => ({ accessories: s.accessories.map((a) => (a.id === id ? { ...a, battery } : a)) }))
  } catch {
    // Connected, but the device does not publish a battery level.
  }
  toast(`${name} paired`, 'good')
}

/** Typical latency per connection, used until the browser gives us a measurement. */
function estimate(link: Link): { latency: number; latencyKind: 'estimated' } {
  const ms: Record<Link, number> = { usb: 70, builtin: 50, wifi: 180, bluetooth: 200, network: 250, screen: 80 }
  return { latency: ms[link], latencyKind: 'estimated' }
}

function shortName(label: string) {
  return label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)/i, '').replace(/^Default - /, '').slice(0, 28)
}
