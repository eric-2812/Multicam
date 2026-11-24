/**
 * Master clock. Everything — tiles, recordings, cut lists and phone clocks — is stamped
 * against this one clock so footage lines up afterwards.
 */
export type Fps = 25 | 30
export type TcMode = 'tod' | 'run'

/** Wall-clock milliseconds with sub-millisecond precision (monotonic within the session). */
export function nowMs() {
  return performance.timeOrigin + performance.now()
}

const p2 = (n: number) => String(Math.floor(n)).padStart(2, '0')

/** Time of day as HH:MM:SS:FF. */
export function todTC(ms: number, fps: Fps) {
  const d = new Date(ms)
  const f = Math.floor((d.getMilliseconds() / 1000) * fps)
  return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}:${p2(f)}`
}

/** Elapsed time as HH:MM:SS:FF. */
export function runTC(elapsedMs: number, fps: Fps) {
  const ms = Math.max(0, elapsedMs)
  const total = Math.floor(ms / 1000)
  const f = Math.floor(((ms % 1000) / 1000) * fps)
  return `${p2(total / 3600)}:${p2((total / 60) % 60)}:${p2(total % 60)}:${p2(f)}`
}

/** The control room's displayed timecode for a moment in time. */
export function masterTC(ms: number, fps: Fps, mode: TcMode, recordingSince: number | null) {
  return mode === 'tod' ? todTC(ms, fps) : runTC(recordingSince ? ms - recordingSince : 0, fps)
}

export function stamp(ms = Date.now()) {
  const d = new Date(ms)
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`
}
