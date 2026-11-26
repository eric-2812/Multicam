/** How a device reaches the control room. */
export type Link = 'usb' | 'wifi' | 'bluetooth' | 'screen' | 'builtin' | 'network'

export type SourceKind = 'webcam' | 'screen' | 'url' | 'phone'

/** Camera settings: applied by the camera where it supports them, otherwise digitally. */
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
  /** Auto exposure (continuous AE on the camera). */
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
  /** Manual focus: the camera's focusDistance range. */
  focus?: [number, number]
  /** Iris range as f-numbers, when a camera reports one. */
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
  /** Motorised / digital pan and tilt reported by the camera (needs PTZ permission in Chrome). */
  pan?: [number, number]
  tilt?: [number, number]
  /** Everything the camera reported, for the generic hardware controls. */
  raw?: { caps: Record<string, RawCap>; settings: Record<string, unknown> }
  /** Resolutions / frame rates the camera can be switched to. */
  modes?: { w: number; h: number; fps: number[] }[]
  torch?: boolean
  width?: number
  height?: number
  fps?: number
}

/** One capability as reported by MediaStreamTrack.getCapabilities(). */
export type RawCap = { min: number; max: number; step?: number } | (string | boolean)[] | boolean

export interface VideoSource {
  id: string
  name: string
  kind: SourceKind
  link: Link
  /** The browser's id for a local camera, and the quality it was opened at (to reopen it next time). */
  deviceId?: string
  quality?: '720' | '1080' | '4k'
  /** Address of a network camera (without any password). */
  url?: string
  /** Model / origin shown under the name. */
  detail: string
  /** Motorised pan/tilt head. */
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

export type LatencyKind = 'measured' | 'estimated'


export interface AudioChannel {
  id: string
  name: string
  /** The browser's id for a local microphone (to reopen it next time). */
  deviceId?: string
  link: Link
  detail: string
  kind: 'mic' | 'phone' | 'screen'
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
  fx: ChannelFx
}

/** Per-microphone processing, in signal order. */
export interface ChannelFx {
  /** Input trim, dB. */
  trim: number
  /** Polarity invert. */
  phase: boolean
  hpf: boolean
  hpfFreq: number
  /** EQ gains in dB; mid is a bell at midFreq. */
  eqLow: number
  eqMid: number
  eqMidFreq: number
  eqHigh: number
  comp: boolean
  /** dBFS */
  compThreshold: number
  compRatio: number
  gate: boolean
  /** dBFS */
  gateThreshold: number
}

export const DEFAULT_FX: ChannelFx = {
  trim: 0,
  phase: false,
  hpf: false,
  hpfFreq: 80,
  eqLow: 0,
  eqMid: 0,
  eqMidFreq: 1000,
  eqHigh: 0,
  comp: false,
  compThreshold: -18,
  compRatio: 3,
  gate: false,
  gateThreshold: -50,
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

/** A camera controlled over Bluetooth so it records on its own card. */
export interface RemoteCam {
  id: string
  kind: 'gopro' | 'sony'
  name: string
  status: 'connecting' | 'connected' | 'lost'
  battery?: number
  /** Last known recording state reported by the camera (null = not reported yet). */
  recording: boolean | null
  /** Start and stop together with Cortiva's REC. */
  follow: boolean
}

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'good' | 'bad'
}
