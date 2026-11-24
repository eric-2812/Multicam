import type { CamSettings, HwCaps, VideoSource } from '../types'

/** Ring markings, laid out evenly like the engraving on a real lens barrel. */
export interface Stop {
  v: number
  label: string
}

const FOCUS_M = [0.3, 0.5, 0.7, 1, 1.5, 2, 3, 5, 10, Infinity]
export const FOCUS_STOPS: Stop[] = FOCUS_M.map((m) => ({ v: m, label: m === Infinity ? '∞' : m < 1 ? `${m}` : `${m}m` }))

const F_NUMBERS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22]
const SHUTTERS = [15, 25, 30, 50, 60, 100, 125, 250, 500, 1000, 2000, 4000, 8000]

export function apertureStops(range: [number, number]): Stop[] {
  return F_NUMBERS.filter((f) => f >= range[0] - 0.01 && f <= range[1] + 0.01).map((f) => ({ v: f, label: `${f}` }))
}

export function shutterStops(range: [number, number]): Stop[] {
  return SHUTTERS.filter((s) => s >= range[0] && s <= range[1]).map((s) => ({ v: s, label: `${s}` }))
}

/** Continuous ring position (0 … stops-1) → value, interpolating geometrically like f-stops. */
export function valueAt(stops: Stop[], pos: number) {
  const i = Math.max(0, Math.min(stops.length - 1, Math.floor(pos)))
  const f = pos - i
  const a = stops[i].v
  const b = stops[Math.min(stops.length - 1, i + 1)].v
  if (f <= 0 || a === b || !isFinite(b)) return a
  return a * Math.pow(b / a, f)
}

export function posOf(stops: Stop[], v: number) {
  if (v <= stops[0].v) return 0
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i].v
    const b = stops[i + 1].v
    if (v <= b) return isFinite(b) ? i + Math.log(v / a) / Math.log(b / a) : i
  }
  return stops.length - 1
}

/** Where the subject sits for each demo scene, in metres — autofocus locks onto this. */
const SUBJECT_M: Record<string, number> = { stage: 4, host: 1.2, guest: 1.3, overhead: 0.7, drone: Infinity, crowd: 10 }

/** Autofocus target as a ring fraction (0 = closest, 1 = infinity). */
export function subjectFocus(src: VideoSource) {
  const m = SUBJECT_M[src.scene ?? ''] ?? 3
  return m === Infinity ? 1 : posOf(FOCUS_STOPS, m) / (FOCUS_STOPS.length - 1)
}

export function focusLabel(frac: number) {
  const pos = frac * (FOCUS_STOPS.length - 1)
  if (pos > FOCUS_STOPS.length - 1.5) return pos >= FOCUS_STOPS.length - 1.05 ? '∞' : '>10 m'
  const m = valueAt(FOCUS_STOPS, pos)
  return m < 1 ? `${Math.round(m * 100)} cm` : `${m.toFixed(1)} m`
}

export function shutterLabel(den: number) {
  return `1/${Math.round(den)}`
}

/**
 * Simulated exposure for demo lenses. Aperture and shutter change the light reaching the
 * sensor; auto-ISO compensates (adding grain) until it runs out of range.
 */
export function exposureModel(s: CamSettings, hw?: HwCaps) {
  const apEv = hw?.aperture ? 2 * Math.log2(2.8 / s.aperture) : 0
  const shEv = hw?.shutter ? Math.log2(50 / s.shutter) : 0
  const ndEv = hw?.nd ? -s.nd : 0
  const lensEv = apEv + shEv + ndEv
  const isoStops = s.autoExposure ? Math.max(0, Math.min(7, -lensEv)) : Math.max(0, Math.min(7, Math.log2(s.iso / 100)))
  const iso = s.autoExposure ? Math.round((100 * Math.pow(2, isoStops)) / 10) * 10 : s.iso
  const residual = lensEv + isoStops
  return { iso, isoStops, ev: residual + s.exposure, lensEv }
}

export const ISO_STOPS: Stop[] = [100, 200, 400, 800, 1600, 3200, 6400, 12800].map((v) => ({ v, label: `${v}` }))
export const ND_STEPS = [0, 2, 4, 6]
export const ND_LABEL: Record<number, string> = { 0: 'Clear', 2: 'ND 0.6', 4: 'ND 1.2', 6: 'ND 1.8' }

/** Shutter angle for a 1/x shutter at a frame rate (180° is the cinematic norm). */
export function shutterAngle(den: number, fps: number) {
  return Math.round((360 * fps) / den)
}

export const WB_PRESETS: { label: string; k: number }[] = [
  { label: 'Tungsten', k: 3200 },
  { label: 'Fluor.', k: 4000 },
  { label: 'Daylight', k: 5600 },
  { label: 'Cloudy', k: 6500 },
  { label: 'Shade', k: 7500 },
]
