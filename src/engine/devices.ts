import { addChannel, addSource, store, toast, uid, updateSource } from '../store'
import { DEFAULT_SETTINGS, type AudioChannel, type HwCaps, type Link, type VideoSource } from '../types'
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
    settings: { ...DEFAULT_SETTINGS },
    presets: [null, null, null, null, null, null],
    status: 'live',
    ...p,
  }
}

export function newChannel(p: Partial<AudioChannel> & Pick<AudioChannel, 'name' | 'kind' | 'link' | 'detail'>): AudioChannel {
  return { id: uid('mic'), gain: 1, pan: 0, muted: false, solo: false, afv: null, status: 'live', ...p }
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
}

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
  return hw
}

/** Track constraints that put the camera's own zoom / focus / shutter / torch where the UI says. */
export function hwConstraints(src: VideoSource): Record<string, unknown> {
  const hw = src.hw ?? {}
  const s = src.settings
  const c: Record<string, unknown> = {}
  if (hw.zoom) c.zoom = hw.zoom[0] + ((s.zoom - 1) / 3) * (hw.zoom[1] - hw.zoom[0])
  if (hw.torch) c.torch = s.torch
  if (hw.focus) {
    if (s.autoFocus) c.focusMode = 'continuous'
    else {
      c.focusMode = 'manual'
      c.focusDistance = hw.focus[0] + s.focus * (hw.focus[1] - hw.focus[0])
    }
  }
  if (hw.shutter) {
    c.exposureMode = 'manual'
    c.exposureTime = 10000 / s.shutter
  }
  return c
}

function watchEnded(id: string, track: MediaStreamTrack, name: string) {
  track.addEventListener('ended', () => {
    updateSource(id, { status: 'lost' })
    toast(`${name} disconnected`, 'bad')
  })
}

export async function addWebcam(device: MediaDeviceInfo, quality: '720' | '1080' | '4k') {
  const h = quality === '4k' ? 2160 : quality === '1080' ? 1080 : 720
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { deviceId: { exact: device.deviceId }, height: { ideal: h }, width: { ideal: (h * 16) / 9 }, frameRate: { ideal: 30 } },
    audio: false,
  })
  const track = stream.getVideoTracks()[0]
  const name = device.label || 'Camera'
  const src = newSource({ name: shortName(name), kind: 'webcam', link: guessLink(name), detail: name, hw: capsOf(track) })
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
  const ch = newChannel({ name: shortName(label), kind: 'mic', link: guessLink(label), detail: label })
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
  const src = newSource({ name: 'Screen', kind: 'screen', link: 'screen', detail: track.label || 'Shared screen', hw: capsOf(track) })
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
  const src = newSource({ name: name || 'IP camera', kind: 'url', link: 'network', detail: url })
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
export function applyHardware(src: VideoSource) {
  if (src.kind === 'demo') return
  const c = hwConstraints(src)
  if (!Object.keys(c).length) return
  if (src.kind === 'phone') {
    sendToPhone(src.id, { type: 'hw', c })
    return
  }
  const track = video.getStream(src.id)?.getVideoTracks()[0]
  track?.applyConstraints({ advanced: [c as MediaTrackConstraintSet] }).catch(() => {})
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

function shortName(label: string) {
  return label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)/i, '').replace(/^Default - /, '').slice(0, 28)
}
