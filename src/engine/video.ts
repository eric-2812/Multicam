import { SCENES, WORLD_H, WORLD_W } from '../demo/scenes'
import { store, toast, type State } from '../store'
import type { VideoSource } from '../types'
import { audio } from './audio'
import { setSceneTime } from '../demo/voices'
import { exposureModel, subjectFocus } from './lens'
import { masterTC, nowMs, stamp } from './timecode'

export const FRAME_W = 960
export const FRAME_H = 540
export const PGM_W = 1280
export const PGM_H = 720

export type Tally = 'program' | 'preview' | 'none'

interface Runtime {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  media?: HTMLVideoElement | HTMLImageElement
  stream?: MediaStream
  lastZoom: number
  huntUntil: number
  /** Next frame must not blend with the previous one (motion-blur trail). */
  fresh?: boolean
  tally: Tally
  /** Phone links get told when they go on air. */
  onTally?: (t: Tally) => void
  cleanup?: () => void
  /** Ring of past frames, for sources delayed to line up with slower ones. */
  history?: FrameDelay
  /** Smoothed capture→display latency from requestVideoFrameCallback (ms). */
  measured?: number
}

/** Up to ~700 ms of past frames at 30 fps, recycled from a small pool. */
class FrameDelay {
  private frames: { c: HTMLCanvasElement; t: number }[] = []
  private pool: HTMLCanvasElement[] = []
  push(src: HTMLCanvasElement, t: number) {
    const last = this.frames[this.frames.length - 1]
    if (last && t - last.t < 30) return
    let c = this.pool.pop()
    if (!c) {
      c = document.createElement('canvas')
      c.width = FRAME_W
      c.height = FRAME_H
    }
    c.getContext('2d')!.drawImage(src, 0, 0)
    this.frames.push({ c, t })
    while (this.frames.length > 24) this.pool.push(this.frames.shift()!.c)
  }
  /** Newest frame captured at or before time t. */
  get(t: number) {
    for (let i = this.frames.length - 1; i >= 0; i--) if (this.frames[i].t <= t) return this.frames[i].c
    return this.frames[0]?.c ?? null
  }
}



function mediaSize(m: HTMLVideoElement | HTMLImageElement): [number, number] {
  if (m instanceof HTMLVideoElement) return [m.videoWidth, m.videoHeight]
  return [m.naturalWidth, m.naturalHeight]
}

/** SMPTE-ish colour bars + caption, used while a source connects or after it drops. */
function bars(ctx: CanvasRenderingContext2D, w: number, h: number, label: string, t: number, lost: boolean) {
  const cols = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0']
  const bw = w / cols.length
  cols.forEach((c, i) => {
    ctx.fillStyle = c
    ctx.fillRect(i * bw, 0, bw + 1, h * 0.72)
  })
  ctx.fillStyle = '#111'
  ctx.fillRect(0, h * 0.72, w, h * 0.28)
  if (lost) {
    // static
    const img = ctx.getImageData(0, 0, w / 4, h / 4)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 150
    }
    ctx.putImageData(img, 0, 0)
    ctx.drawImage(ctx.canvas, 0, 0, w / 4, h / 4, 0, 0, w, h)
  }
  ctx.fillStyle = 'rgba(0,0,0,.7)'
  ctx.fillRect(w / 2 - 190, h / 2 - 34, 380, 68)
  ctx.fillStyle = Math.floor(t * 2) % 2 ? '#fff' : '#fbbf24'
  ctx.font = '600 30px "Barlow Condensed", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, w / 2, h / 2)
  ctx.textAlign = 'start'
  ctx.textBaseline = 'alphabetic'
}

/** Picture profiles: multipliers on brightness, contrast and saturation. */
const PROFILES = {
  standard: { b: 1, c: 1, s: 1 },
  flat: { b: 1.06, c: 0.78, s: 0.8 },
  vivid: { b: 1, c: 1.14, s: 1.35 },
  mono: { b: 1, c: 1.08, s: 0 },
} as const

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

let scratchCanvas: HTMLCanvasElement | null = null
function scratch() {
  if (!scratchCanvas) {
    scratchCanvas = document.createElement('canvas')
    scratchCanvas.width = FRAME_W
    scratchCanvas.height = FRAME_H
  }
  return scratchCanvas
}

let grainCanvas: HTMLCanvasElement | null = null
function grain() {
  if (!grainCanvas) {
    grainCanvas = document.createElement('canvas')
    grainCanvas.width = 512
    grainCanvas.height = 288
    const g = grainCanvas.getContext('2d')!
    const img = g.createImageData(512, 288)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 255
    }
    g.putImageData(img, 0, 0)
  }
  return grainCanvas
}

class VideoEngine {
  private runtimes = new Map<string, Runtime>()
  /** Program and preview are always composed (so the program can record from any page). */
  private monitors = { program: makeCanvas(PGM_W, PGM_H), preview: makeCanvas(640, 360) }
  private raf = 0
  private autoStart = 0
  private ftbLevel = 0
  private ltLevel = 0
  private slateUntil = 0
  private lastLatencyPush = 0

  private runtime(id: string): Runtime {
    let rt = this.runtimes.get(id)
    if (!rt) {
      const canvas = document.createElement('canvas')
      canvas.width = FRAME_W
      canvas.height = FRAME_H
      rt = { canvas, ctx: canvas.getContext('2d')!, lastZoom: 1, huntUntil: 0, tally: 'none' }
      this.runtimes.set(id, rt)
    }
    return rt
  }

  /** The live frame canvas for a source — tiles mount it directly. */
  frame(id: string) {
    return this.runtime(id).canvas
  }

  /** Canvas elements for the program / preview monitors; the UI mounts them directly. */
  monitorEl(which: 'program' | 'preview') {
    return this.monitors[which]
  }


  attachStream(id: string, stream: MediaStream, extra?: Partial<Runtime>) {
    const rt = this.runtime(id)
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.autoplay = true
    v.srcObject = stream
    void v.play().catch(() => {})
    rt.media = v
    rt.stream = stream
    Object.assign(rt, extra)
    this.measure(rt, v)
    return rt
  }

  /**
   * Chrome reports when each frame was captured (captureTime) for cameras and WebRTC streams;
   * the gap to "now" is the real glass-to-screen latency of that source.
   */
  private measure(rt: Runtime, v: HTMLVideoElement) {
    type Meta = { captureTime?: number; receiveTime?: number }
    const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number, m: Meta) => void) => number }).requestVideoFrameCallback
    if (!rvfc) return
    const cb = (now: number, m: Meta) => {
      if (rt.media !== v) return
      if (m.captureTime && m.captureTime > 0) {
        const lat = now - m.captureTime
        if (lat > 0 && lat < 5000) rt.measured = rt.measured === undefined ? lat : rt.measured * 0.9 + lat * 0.1
      }
      rvfc.call(v, cb)
    }
    rvfc.call(v, cb)
  }

  attachUrl(id: string, url: string, asVideo: boolean, onError: () => void, onTainted: () => void) {
    const rt = this.runtime(id)
    const load = (cors: boolean) => {
      if (asVideo) {
        const v = document.createElement('video')
        if (cors) v.crossOrigin = 'anonymous'
        v.muted = true
        v.loop = true
        v.playsInline = true
        v.autoplay = true
        v.src = url
        v.onerror = () => (cors ? (onTainted(), load(false)) : onError())
        void v.play().catch(() => {})
        rt.media = v
      } else {
        const img = new Image()
        if (cors) img.crossOrigin = 'anonymous'
        img.onerror = () => (cors ? (onTainted(), load(false)) : onError())
        img.src = url
        rt.media = img
      }
    }
    load(true)
  }

  getStream(id: string) {
    return this.runtimes.get(id)?.stream
  }

  remove(id: string) {
    const rt = this.runtimes.get(id)
    if (!rt) return
    rt.cleanup?.()
    rt.stream?.getTracks().forEach((t) => t.stop())
    if (rt.media instanceof HTMLVideoElement) {
      rt.media.srcObject = null
      rt.media.removeAttribute('src')
    }
    this.runtimes.delete(id)
  }

  start() {
    if (this.raf) return
    const loop = () => {
      this.raf = requestAnimationFrame(loop)
      this.tick(performance.now() / 1000)
    }
    this.raf = requestAnimationFrame(loop)
  }

  // ------------------------------------------------------------ per frame

  private tick(t: number) {
    let st = store.get()
    if (st.transitioning && this.autoStart) {
      const p = Math.min(1, (performance.now() - this.autoStart) / st.duration)
      if (p >= 1) this.finishTransition()
      else store.set({ tbar: p })
      st = store.get()
    }
    for (const src of st.sources) {
      const rt = this.runtime(src.id)
      this.renderSource(src, rt, t)
      const tally: Tally = src.id === st.program ? 'program' : src.id === st.preview ? 'preview' : 'none'
      if (tally !== rt.tally) {
        rt.tally = tally
        rt.onTally?.(tally)
      }
    }
    if (performance.now() - this.lastLatencyPush > 1000) {
      this.lastLatencyPush = performance.now()
      this.pushMeasuredLatency(st)
    }
    this.ftbLevel += ((st.ftb ? 1 : 0) - this.ftbLevel) * 0.12
    this.ltLevel += ((st.lowerThird.on ? 1 : 0) - this.ltLevel) * 0.15
    this.composeProgram(this.monitors.program, st, t)
    if (st.view === 'switch' && st.page === 'live') this.composePreview(this.monitors.preview, st)
    audio.sync(st)
  }

  private renderSource(src: VideoSource, rt: Runtime, t: number) {
    const { ctx } = rt
    const W = FRAME_W
    const H = FRAME_H
    const s = src.settings
    if (src.status !== 'live') {
      rt.fresh = true
      bars(ctx, W, H, src.status === 'lost' ? 'SIGNAL LOST' : 'CONNECTING…', t, src.status === 'lost')
      return
    }
    const sim = src.kind === 'demo'

    // 1. Raw picture into the shared scratch canvas, with no per-draw filters (much faster).
    const sc = scratch()
    const sx = sc.getContext('2d')!
    sx.setTransform(1, 0, 0, 1, 0, 0)
    sx.fillStyle = '#000'
    sx.fillRect(0, 0, W, H)
    if (sim && src.scene) {
      const k = (W / WORLD_W) * s.zoom
      const panRange = src.ptz ? 520 : (WORLD_W / 2) * (1 - 1 / s.zoom)
      const tiltRange = src.ptz ? 300 : (WORLD_H / 2) * (1 - 1 / s.zoom)
      sx.translate(W / 2, H / 2)
      sx.scale(k, k)
      sx.translate(-(WORLD_W / 2 + s.pan * panRange), -(WORLD_H / 2 + s.tilt * tiltRange))
      // A simulated device shows the world as it was `latency` ms ago, plus any sync delay.
      const lag = (src.latencyKind === 'simulated' ? (src.latency ?? 0) : 0) + src.delay
      setSceneTime(performance.now() - lag)
      SCENES[src.scene]?.(sx, t - lag / 1000)
      sx.setTransform(1, 0, 0, 1, 0, 0)
    } else if (rt.media) {
      const [vw, vh] = mediaSize(rt.media)
      if (!vw || !vh) {
        bars(ctx, W, H, 'WAITING FOR VIDEO…', t, false)
        return
      }
      this.drawMedia(sx, rt.media, vw, vh, src)
    }

    // Sync delay for real sources: show the frame from `delay` ms ago.
    let pic: HTMLCanvasElement = sc
    if (!sim && src.delay > 0) {
      rt.history ??= new FrameDelay()
      const now = performance.now()
      rt.history.push(sc, now)
      pic = rt.history.get(now - src.delay) ?? sc
    } else if (rt.history) {
      rt.history = undefined
    }

    // 2. Lens + image processing onto the frame.
    if (Math.abs(s.zoom - rt.lastZoom) > 0.01) {
      rt.lastZoom = s.zoom
      if (s.autoFocus) rt.huntUntil = t + 0.45
    }
    const hunt = sim && s.autoFocus && t < rt.huntUntil ? Math.sin(((rt.huntUntil - t) / 0.45) * Math.PI) * 4 : 0
    let blur = hunt
    let ev = s.exposure
    let iso = 0
    let trail = 1
    if (sim) {
      const exp = exposureModel(s, src.hw)
      ev = exp.ev
      iso = exp.isoStops
      // Depth of field: the further the ring is from the subject, and the wider the iris, the softer.
      if (src.hw?.focus && !s.autoFocus) {
        const dof = src.hw.aperture ? 2.8 / s.aperture : 0.8
        blur = Math.min(14, Math.abs(s.focus - subjectFocus(src)) * 34 * dof)
      }
      // Slow shutters smear motion: blend over the previous frame.
      if (src.hw?.shutter) trail = Math.min(1, 0.2 + (0.8 * s.shutter) / 125)
    }
    const prof = PROFILES[s.profile]
    const bright = Math.pow(2, ev * 0.7) * prof.b
    const contrast = s.contrast * prof.c
    const sat = s.saturation * prof.s
    const parts: string[] = []
    if (Math.abs(bright - 1) > 0.005) parts.push(`brightness(${bright.toFixed(3)})`)
    if (Math.abs(contrast - 1) > 0.005) parts.push(`contrast(${contrast.toFixed(3)})`)
    if (s.profile === 'mono') parts.push('grayscale(1)')
    else if (Math.abs(sat - 1) > 0.005) parts.push(`saturate(${sat.toFixed(3)})`)
    if (blur > 0.25) parts.push(`blur(${blur.toFixed(2)}px)`)

    ctx.save()
    if (rt.fresh) {
      trail = 1
      rt.fresh = false
    }
    ctx.globalAlpha = trail
    ctx.filter = parts.length ? parts.join(' ') : 'none'
    if (s.mirror) {
      ctx.translate(W, 0)
      ctx.scale(-1, 1)
    }
    if (s.rotate) {
      // Rotate about the centre; quarter turns are fitted inside the 16:9 frame.
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, W, H)
      ctx.translate(W / 2, H / 2)
      ctx.rotate((s.rotate * Math.PI) / 180)
      const q = s.rotate % 180 !== 0
      const k = q ? H / W : 1
      ctx.drawImage(pic, (-W / 2) * k, (-H / 2) * k, W * k, H * k)
    } else if (blur > 0.25) {
      // Blur samples beyond the edge; overscan slightly so the border doesn't go dark.
      ctx.drawImage(pic, -blur * 2, -blur * 2, W + blur * 4, H + blur * 4)
    } else {
      ctx.drawImage(pic, 0, 0)
    }
    ctx.restore()

    // White balance: a higher Kelvin setting gives a warmer picture. Cameras with their own
    // white balance do it in hardware; auto WB on a simulated lens is neutral.
    const digitalWb = !src.hw?.wb && !(sim && s.autoWhiteBalance)
    const wb = digitalWb ? Math.max(-1, Math.min(1, (s.whiteBalance - 5600) / 2000)) : 0
    if (Math.abs(wb) > 0.04 && s.profile !== 'mono') {
      ctx.save()
      ctx.globalCompositeOperation = 'soft-light'
      ctx.globalAlpha = Math.abs(wb) * 0.75
      ctx.fillStyle = wb > 0 ? '#ff8a2a' : '#2a7bff'
      ctx.fillRect(0, 0, W, H)
      ctx.restore()
    }
    if (Math.abs(s.tint) > 2 && s.profile !== 'mono') {
      ctx.save()
      ctx.globalCompositeOperation = 'soft-light'
      ctx.globalAlpha = (Math.abs(s.tint) / 50) * 0.6
      ctx.fillStyle = s.tint > 0 ? '#ff2bd6' : '#2bff6a'
      ctx.fillRect(0, 0, W, H)
      ctx.restore()
    }
    if (sim && src.hw?.aperture && s.aperture < 2.4) {
      // Wide-open vignetting.
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62)
      v.addColorStop(0, 'rgba(0,0,0,0)')
      v.addColorStop(1, `rgba(0,0,0,${Math.min(0.55, (2.4 - s.aperture) * 0.55)})`)
      ctx.fillStyle = v
      ctx.fillRect(0, 0, W, H)
    }
    if (iso > 1.5) {
      // High ISO grain.
      ctx.save()
      ctx.globalAlpha = Math.min(0.32, (iso - 1.5) * 0.06)
      ctx.globalCompositeOperation = 'overlay'
      const g = grain()
      ctx.drawImage(g, -Math.random() * 64, -Math.random() * 64, W + 128, H + 128)
      ctx.restore()
    }
    // Sync slate: every camera flashes white on the same frame (visible in program and ISOs).
    if (performance.now() < this.slateUntil) {
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, W, H)
    }
  }

  private pushMeasuredLatency(st: State) {
    for (const src of st.sources) {
      const m = this.runtimes.get(src.id)?.measured
      if (m === undefined || src.latencyKind === 'simulated') continue
      const ms = Math.round(m / 5) * 5
      if (src.latencyKind !== 'measured' || Math.abs((src.latency ?? 0) - ms) >= 10) {
        store.set((s) => ({ sources: s.sources.map((x) => (x.id === src.id ? { ...x, latency: ms, latencyKind: 'measured' } : x)) }))
      }
    }
  }

  private drawMedia(ctx: CanvasRenderingContext2D, media: HTMLVideoElement | HTMLImageElement, vw: number, vh: number, src: VideoSource) {
    const W = FRAME_W
    const H = FRAME_H
    const s = src.settings
    // Hardware zoom (if the camera has it) replaces the digital crop.
    const dz = src.hw?.zoom ? 1 : s.zoom
    const srcAspect = vw / vh
    const outAspect = W / H
    const portraitish = Math.abs(srcAspect - outAspect) > 0.3
    if (portraitish) {
      // Blurred fill behind a contained image (phones held upright, 4:3 cams…).
      ctx.save()
      ctx.filter = 'blur(24px) brightness(.55)'
      const ch = Math.min(vh, vw / outAspect)
      ctx.drawImage(media, 0, (vh - ch) / 2, vw, ch, -40, -40, W + 80, H + 80)
      ctx.restore()
    }
    let cw: number
    let chh: number
    if (portraitish) {
      cw = vw / dz
      chh = vh / dz
    } else if (srcAspect > outAspect) {
      chh = vh / dz
      cw = chh * outAspect
    } else {
      cw = vw / dz
      chh = cw / outAspect
    }
    const cx = (vw - cw) / 2 + (s.pan * (vw - cw)) / 2
    const cy = (vh - chh) / 2 + (s.tilt * (vh - chh)) / 2
    if (portraitish) {
      const scale = Math.min(W / cw, H / chh)
      const dw = cw * scale
      const dh = chh * scale
      ctx.drawImage(media, cx, cy, cw, chh, (W - dw) / 2, (H - dh) / 2, dw, dh)
    } else {
      ctx.drawImage(media, cx, cy, cw, chh, 0, 0, W, H)
    }
  }

  private drawFrame(ctx: CanvasRenderingContext2D, id: string | null, w: number, h: number) {
    if (!id) return
    const rt = this.runtimes.get(id)
    if (rt) ctx.drawImage(rt.canvas, 0, 0, w, h)
  }

  private composeProgram(c: HTMLCanvasElement, st: State, t: number) {
    const ctx = c.getContext('2d')!
    const W = c.width
    const H = c.height
    ctx.globalAlpha = 1
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
    const p = st.transitioning ? st.tbar : 0
    if (p <= 0) {
      this.drawFrame(ctx, st.program, W, H)
    } else {
      switch (st.transition) {
        case 'mix':
          this.drawFrame(ctx, st.program, W, H)
          ctx.globalAlpha = p
          this.drawFrame(ctx, st.preview, W, H)
          ctx.globalAlpha = 1
          break
        case 'dip':
          if (p < 0.5) {
            ctx.globalAlpha = 1 - p * 2
            this.drawFrame(ctx, st.program, W, H)
          } else {
            ctx.globalAlpha = p * 2 - 1
            this.drawFrame(ctx, st.preview, W, H)
          }
          ctx.globalAlpha = 1
          break
        case 'wipe': {
          this.drawFrame(ctx, st.program, W, H)
          const x = W * p
          ctx.save()
          ctx.beginPath()
          ctx.rect(0, 0, x, H)
          ctx.clip()
          this.drawFrame(ctx, st.preview, W, H)
          ctx.restore()
          ctx.fillStyle = '#fff'
          ctx.fillRect(x - 2, 0, 4, H)
          break
        }
        case 'push': {
          const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
          ctx.save()
          ctx.translate(-W * e, 0)
          this.drawFrame(ctx, st.program, W, H)
          ctx.translate(W, 0)
          this.drawFrame(ctx, st.preview, W, H)
          ctx.restore()
          break
        }
      }
    }

    // Lower third (downstream key)
    if (this.ltLevel > 0.01) {
      const k = W / 1280
      const e = 1 - Math.pow(1 - this.ltLevel, 3)
      const x = 70 * k - (1 - e) * 600 * k
      const y = H - 170 * k
      ctx.save()
      ctx.globalAlpha = Math.min(1, this.ltLevel * 1.4)
      ctx.font = `600 ${40 * k}px "Barlow Condensed", system-ui, sans-serif`
      const tw = Math.max(ctx.measureText(st.lowerThird.title).width, 280 * k)
      ctx.fillStyle = '#e11d2e'
      ctx.fillRect(x, y, 10 * k, 92 * k)
      ctx.fillStyle = 'rgba(12,14,20,.88)'
      ctx.fillRect(x + 10 * k, y, tw + 60 * k, 56 * k)
      ctx.fillStyle = '#fff'
      ctx.fillText(st.lowerThird.title, x + 34 * k, y + 41 * k)
      ctx.font = `500 ${24 * k}px "Barlow Condensed", system-ui, sans-serif`
      const sw = ctx.measureText(st.lowerThird.subtitle).width
      ctx.fillStyle = 'rgba(245,245,245,.95)'
      ctx.fillRect(x + 10 * k, y + 56 * k, sw + 48 * k, 36 * k)
      ctx.fillStyle = '#111'
      ctx.fillText(st.lowerThird.subtitle, x + 34 * k, y + 82 * k)
      ctx.restore()
    }

    // Live bug, top-right
    if (st.recordingSince) {
      const k = W / 1280
      ctx.fillStyle = Math.floor(t * 1.5) % 2 ? 'rgba(225,29,46,.95)' : 'rgba(225,29,46,.6)'
      ctx.beginPath()
      ctx.arc(W - 46 * k, 42 * k, 9 * k, 0, Math.PI * 2)
      ctx.fill()
    }

    if (st.burnIn) {
      const k = W / 1280
      const tc = masterTC(nowMs(), st.fps, st.tcMode, st.recordingSince)
      ctx.save()
      ctx.font = `600 ${30 * k}px "IBM Plex Mono", ui-monospace, monospace`
      const tw = ctx.measureText(tc).width
      ctx.fillStyle = 'rgba(0,0,0,.75)'
      ctx.fillRect(W / 2 - tw / 2 - 14 * k, H - 64 * k, tw + 28 * k, 44 * k)
      ctx.fillStyle = '#fff'
      ctx.textAlign = 'center'
      ctx.fillText(tc, W / 2, H - 32 * k)
      ctx.restore()
    }

    if (this.ftbLevel > 0.005) {
      ctx.fillStyle = `rgba(0,0,0,${Math.min(1, this.ftbLevel * 1.02)})`
      ctx.fillRect(0, 0, W, H)
    }
  }

  private composePreview(c: HTMLCanvasElement, st: State) {
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, c.width, c.height)
    this.drawFrame(ctx, st.preview, c.width, c.height)
  }

  // ------------------------------------------------------------ switching

  cut() {
    const st = store.get()
    if (!st.preview || st.transitioning) return
    store.set({ program: st.preview, preview: st.program })
  }

  auto() {
    const st = store.get()
    if (!st.preview || st.transitioning) return
    this.autoStart = performance.now()
    store.set({ transitioning: true, tbar: 0 })
  }

  /** Manual T-bar. Reaching the end completes the transition. */
  setTbar(v: number) {
    const st = store.get()
    if (!st.preview) return
    this.autoStart = 0
    if (v >= 0.999) this.finishTransition()
    else store.set({ tbar: v, transitioning: v > 0 })
  }

  private finishTransition() {
    const st = store.get()
    this.autoStart = 0
    store.set({ program: st.preview, preview: st.program, tbar: 0, transitioning: false })
  }

  hotCut(id: string) {
    const st = store.get()
    if (st.program === id || st.transitioning) return
    store.set({ program: id, preview: st.preview === id ? st.program : st.preview })
  }

  // ------------------------------------------------------------ outputs

  snapshot() {
    const c = this.monitors.program
    if (!c) return
    try {
      c.toBlob((b) => b && download(b, `program-${stamp()}.png`), 'image/png')
    } catch {
      toast('Snapshot blocked: a network camera does not allow capture (CORS).', 'bad')
    }
  }

  /** The program output canvas (recording source for the switched program). */
  get programCanvas() {
    return this.monitors.program
  }

  /** The camera's native stream, for clean recordings. */
  rawStream(id: string) {
    return this.runtimes.get(id)?.stream ?? null
  }

  /** White flash on every camera on the same frame (the visual half of a slate). */
  flash() {
    this.slateUntil = performance.now() + 70
  }
}

/**
 * Save a blob as a download. Browsers silently drop downloads fired in quick succession,
 * so they go through a queue with a short gap between each.
 */
const queue: { blob: Blob; name: string }[] = []
let draining = false
export function download(blob: Blob, name: string) {
  queue.push({ blob, name })
  if (draining) return
  draining = true
  const next = () => {
    const item = queue.shift()
    if (!item) {
      draining = false
      return
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(item.blob)
    a.download = item.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
    setTimeout(next, 450)
  }
  next()
}

export const video = new VideoEngine()
