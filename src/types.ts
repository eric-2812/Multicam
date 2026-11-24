/** How a device reaches the control room. */
export type Link = 'usb' | 'wifi' | 'bluetooth' | 'screen' | 'builtin' | 'network'

export type SourceKind = 'demo' | 'webcam' | 'screen' | 'url' | 'phone'

/** Image adjustments. Optical on demo cameras, digital (or via track constraints) on real ones. */
export interface CamSettings {
  zoom: number // 1..4
  pan: number // -1..1
  tilt: number // -1..1
  /** Focus ring position: 0 = closest focus, 1 = infinity. */
  focus: number
  autoFocus: boolean
  /** f-number, for cameras with an iris. */
  aperture: number
  /** Shutter speed as 1/x of a second. */
  shutter: number
  /** Exposure compensation, -2..2 EV. */
  exposure: number
  /** Auto exposure: auto-ISO on simulated lenses, continuous AE on real cameras. */
  autoExposure: boolean
  /** Manual ISO when auto exposure is off. */
  iso: number
  /** Neutral density, in stops (0, 2, 4, 6). */
  nd: number
  whiteBalance: number // 2800..7500 K
  /** Green (-) / magenta (+) tint, -50..50. */
  tint: number
  autoWhiteBalance: boolean
  profile: Profile
  saturation: number // 0..2
  contrast: number // 0.5..1.5
  sharpness: number // 0..1 (hardware only)
  mirror: boolean
  /** Rotation in degrees. */
  rotate: 0 | 90 | 180 | 270
  torch: boolean
}

export type Profile = 'standard' | 'flat' | 'vivid' | 'mono'

/** How each camera is recorded. */
export interface RecSettings {
  /** Armed: writes its own file when Record is pressed. */
  armed: boolean
  /** Clean = the camera's native signal. Processed = with this app's image adjustments. */
  feed: 'clean' | 'processed'
}

export const DEFAULT_SETTINGS: CamSettings = {
  zoom: 1,
  pan: 0,
  tilt: 0,
  focus: 0.5,
  autoFocus: true,
  aperture: 2.8,
  shutter: 50,
  exposure: 0,
  autoExposure: true,
  iso: 400,
  nd: 0,
  whiteBalance: 5600,
  tint: 0,
  autoWhiteBalance: false,
  profile: 'standard',
  saturation: 1,
  contrast: 1,
  sharpness: 0.5,
  mirror: false,
  rotate: 0,
  torch: false,
}

export interface PtzPreset {
  zoom: number
  pan: number
  tilt: number
}

/** What the camera lets us drive. Each lens ring only appears when its entry is present. */
export interface HwCaps {
  zoom?: [number, number]
  /** Manual focus; hardware focusDistance range (simulated lenses use [0, 1]). */
  focus?: [number, number]
  /** Iris range as f-numbers. Browsers never expose this for real webcams, so demo lenses only. */
  aperture?: [number, number]
  /** Shutter range as 1/x seconds (slowest, fastest). */
  shutter?: [number, number]
  /** Manual ISO range. */
  iso?: [number, number]
  /** Colour temperature range (K) for hardware white balance. */
  wb?: [number, number]
  /** Exposure compensation range (EV). */
  ev?: [number, number]
  sharpness?: [number, number]
  /** Simulated ND filter wheel. */
  nd?: boolean
  /** Resolutions / frame rates the camera can be switched to. */
  modes?: { w: number; h: number; fps: number[] }[]
  torch?: boolean
  width?: number
  height?: number
  fps?: number
}

export interface VideoSource {
  id: string
  name: string
  kind: SourceKind
  link: Link
  /** Model / origin shown under the name. */
  detail: string
  /** Demo scene id, for kind === 'demo'. */
  scene?: string
  /** Optical pan/tilt head (demo) — real sources get digital pan inside the zoomed crop. */
  ptz: boolean
  settings: CamSettings
  presets: (PtzPreset | null)[]
  /** 0..100, undefined when mains-powered. */
  battery?: number
  /** 0..4 bars for wireless links. */
  signal?: number
  status: 'live' | 'connecting' | 'lost'
  hw?: HwCaps
  rec: RecSettings
  /** Short camera number shown on tiles, slates and file names. */
  number: number
  /** Cross-origin stream that can be shown but not recorded. */
  tainted?: boolean
  /** How late the picture arrives (ms), and where that number comes from. */
  latency?: number
  latencyKind?: LatencyKind
  /** Extra delay added to line this source up with the others (ms). */
  delay: number
  /** Phone clock vs the master clock, from the Wi-Fi sync handshake. */
  clock?: { offset: number; rtt: number }
}

export type LatencyKind = 'measured' | 'estimated' | 'simulated'

export type Voice = 'host' | 'guest' | 'music' | 'room' | 'crowd'

export interface AudioChannel {
  id: string
  name: string
  link: Link
  detail: string
  kind: 'demo' | 'mic' | 'phone' | 'screen'
  voice?: Voice
  gain: number // fader 0..1.5 (1 = unity)
  pan: number // -1..1
  muted: boolean
  solo: boolean
  /** Audio-follows-video: channel only opens while this source is on program. */
  afv: string | null
  battery?: number
  status: 'live' | 'lost'
  latency?: number
  latencyKind?: LatencyKind
  /** Extra delay for lip sync (ms). */
  delay: number
}

export type TransitionType = 'mix' | 'dip' | 'wipe' | 'push'

export interface Accessory {
  id: string
  name: string
  detail: string
  battery?: number
  link: Link
  status: 'connected' | 'lost'
}

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'good' | 'bad'
}
