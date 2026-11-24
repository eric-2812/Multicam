import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { exposureModel, focusLabel, ND_LABEL, shutterLabel } from '../engine/lens'
import { analyse, drawGuides, histogram } from '../engine/monitor'
import { recorder } from '../engine/recorder'
import { video } from '../engine/video'
import { store, useStore, type Guides, type View } from '../store'
import type { TransitionType, VideoSource } from '../types'
import { Battery, Icon, LINK_LABEL, Signal } from './Icon'
import { Inspector } from './Inspector'
import { Mixer } from './Mixer'
import { Seg, fmtBytes } from './ui'

// ------------------------------------------------------------------ tile

function RecBadge({ src }: { src: VideoSource }) {
  const rec = useStore((s) => !!s.recordingSince)
  const [bytes, setBytes] = useState<number | null>(null)
  useEffect(() => {
    if (!rec) return setBytes(null)
    const t = setInterval(() => setBytes(recorder.bytes(src.id)), 1000)
    return () => clearInterval(t)
  }, [rec, src.id])
  if (rec && bytes !== null) return <span className="t-rec is-rec">REC {fmtBytes(bytes)}</span>
  if (!src.rec.armed) return <span className="t-rec is-off">NOT ARMED</span>
  return null
}

export function Tile({ src, compact }: { src: VideoSource; compact?: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const program = useStore((s) => s.program === src.id)
  const preview = useStore((s) => s.preview === src.id)
  const selected = useStore((s) => s.selected === src.id)
  const view = useStore((s) => s.view)

  useEffect(() => {
    const c = video.frame(src.id)
    host.current?.appendChild(c)
    return () => c.remove()
  }, [src.id])

  const select = () => store.set((s) => ({ selected: src.id, preview: view === 'switch' && !program ? src.id : s.preview }))
  const res = src.hw?.height ? `${src.hw.height >= 2160 ? '4K' : `${src.hw.height}p`}${src.hw.fps ?? ''}` : ''
  return (
    <div
      className={`tile ${program ? 't-pgm' : preview ? 't-pvw' : ''} ${selected ? 'is-sel' : ''} ${src.status !== 'live' ? 'is-down' : ''} ${compact ? 'is-compact' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Camera ${src.number}, ${src.name}${program ? ', on program' : ''}`}
      onClick={select}
      onDoubleClick={() => video.hotCut(src.id)}
      onKeyDown={(e) => e.key === 'Enter' && select()}
    >
      <div className="t-video" ref={host} />
      <div className="t-top">
        <span className="t-num">{src.number}</span>
        <span className="t-name">{src.name}</span>
        <span className="grow" />
        {!compact && <RecBadge src={src} />}
      </div>
      {!compact && (
        <div className="t-bot">
          <span className="t-meta">{LINK_LABEL[src.link]}</span>
          {res && <span className="t-meta">{res}</span>}
          {src.latency !== undefined && <span className="t-meta">{src.latency + src.delay} ms</span>}
          <span className="grow" />
          {src.signal !== undefined && <Signal bars={src.status === 'live' ? src.signal : 0} />}
          {src.battery !== undefined && <Battery level={src.battery} />}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ grid

/** Pick the column count that makes 16:9 tiles as large as possible in the box. */
function useFit(n: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState({ cols: 1, w: 320 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const calc = () => {
      const gap = 6
      const W = el.clientWidth
      const H = el.clientHeight
      let best = { cols: 1, w: 0 }
      for (let cols = 1; cols <= Math.max(1, n); cols++) {
        const rows = Math.ceil(n / cols)
        const w = Math.min((W - (cols - 1) * gap) / cols, ((H - (rows - 1) * gap) / rows) * (16 / 9))
        if (w > best.w) best = { cols, w }
      }
      setFit({ cols: best.cols, w: Math.max(120, Math.floor(best.w)) })
    }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(el)
    return () => ro.disconnect()
  }, [n])
  return { ref, fit }
}

function EmptyState() {
  return (
    <div className="empty">
      <Icon name="cam" size={28} />
      <h2>No cameras connected</h2>
      <p>Add webcams, capture cards, phones over Wi-Fi or IP cameras. Every camera records to its own file for editing.</p>
      <div className="row">
        <button className="btn btn-primary" onClick={() => store.set({ page: 'setup', setupSection: 'devices' })}>
          <Icon name="plus" size={14} /> Add devices
        </button>
      </div>
    </div>
  )
}

function GridView({ sources }: { sources: VideoSource[] }) {
  const { ref, fit } = useFit(sources.length)
  return (
    <div className="grid-view" ref={ref}>
      {sources.length ? (
        <div className="grid-tiles" style={{ gridTemplateColumns: `repeat(${fit.cols}, ${fit.w}px)` }}>
          {sources.map((s) => (
            <Tile key={s.id} src={s} />
          ))}
        </div>
      ) : (
        <EmptyState />
      )}
    </div>
  )
}

// ------------------------------------------------------------------ focus

function Histogram() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let raf = 0
    const draw = () => {
      const c = ref.current
      if (c) {
        const ctx = c.getContext('2d')!
        const W = c.width
        const H = c.height
        ctx.clearRect(0, 0, W, H)
        let max = 1
        for (const v of histogram) max = Math.max(max, v)
        ctx.fillStyle = 'rgba(255,255,255,.08)'
        ctx.fillRect(0, 0, W, H)
        ctx.fillStyle = 'rgba(235,235,240,.85)'
        const bw = W / histogram.length
        histogram.forEach((v, i) => {
          const h = Math.sqrt(v / max) * (H - 2)
          ctx.fillRect(i * bw, H - h, bw - 0.5, h)
        })
        ctx.strokeStyle = 'rgba(255,255,255,.25)'
        ctx.beginPath()
        for (const f of [0.25, 0.5, 0.75]) {
          ctx.moveTo(W * f, 0)
          ctx.lineTo(W * f, H)
        }
        ctx.stroke()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <canvas ref={ref} width={192} height={72} className="histo" aria-label="Luma histogram" />
}

function Osd({ src }: { src: VideoSource }) {
  const fps = useStore((s) => s.fps)
  const s = src.settings
  const hw = src.hw ?? {}
  const exp = src.kind === 'demo' ? exposureModel(s, hw) : null
  const items: string[] = []
  if (hw.height) items.push(`${hw.width}×${hw.height}${hw.fps ? `p${hw.fps}` : ''}`)
  if (hw.aperture) items.push(`f/${s.aperture.toFixed(1)}`)
  if (hw.shutter) items.push(`${shutterLabel(s.shutter)} (${Math.round((360 * (hw.fps ?? fps)) / s.shutter)}°)`)
  if (exp || hw.iso) items.push(`ISO ${exp ? exp.iso : s.iso}${s.autoExposure ? ' A' : ''}`)
  if (hw.nd) items.push(ND_LABEL[s.nd])
  items.push(s.autoWhiteBalance ? 'AWB' : `${s.whiteBalance}K`)
  if (hw.focus) items.push(s.autoFocus ? 'AF' : `MF ${focusLabel(s.focus)}`)
  if (s.zoom > 1.01) items.push(`${s.zoom.toFixed(1)}×`)
  return (
    <div className="osd">
      {items.map((t) => (
        <span key={t}>{t}</span>
      ))}
    </div>
  )
}

function FocusMonitor({ src }: { src: VideoSource }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const mon = useStore((s) => s.monitor)
  const monRef = useRef(mon)
  monRef.current = mon
  useEffect(() => {
    let raf = 0
    let frame = 0
    let overlay: HTMLCanvasElement | null = null
    const draw = () => {
      const c = ref.current
      const m = monRef.current
      if (c) {
        const ctx = c.getContext('2d')!
        const f = video.frame(src.id)
        ctx.drawImage(f, 0, 0, c.width, c.height)
        // Analysis at ~20 fps is plenty for zebras / peaking / histogram.
        if (frame++ % 3 === 0 && (m.zebra || m.peaking || m.histogram)) overlay = analyse(f, m, frame >> 2)
        if ((m.zebra || m.peaking) && overlay) ctx.drawImage(overlay, 0, 0, c.width, c.height)
        drawGuides(ctx, c.width, c.height, m.guides)
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [src.id])
  const program = useStore((s) => s.program === src.id)
  return (
    <div className={`focus-mon ${program ? 't-pgm' : ''}`}>
      <canvas ref={ref} width={1280} height={720} />
      <div className="fm-top">
        <span className="t-num">{src.number}</span>
        <span className="t-name">{src.name}</span>
        {program && <span className="tag tag-pgm">PGM</span>}
        <span className="grow" />
        <RecBadge src={src} />
      </div>
      <div className="fm-bot">
        <Osd src={src} />
        {mon.histogram && <Histogram />}
      </div>
    </div>
  )
}

function Strip({ sources }: { sources: VideoSource[] }) {
  return (
    <div className="strip-row" role="list">
      {sources.map((s) => (
        <div role="listitem" key={s.id} className="strip-item">
          <Tile src={s} compact />
        </div>
      ))}
    </div>
  )
}

function FocusView({ sources }: { sources: VideoSource[] }) {
  const selected = useStore((s) => s.sources.find((x) => x.id === s.selected) ?? s.sources[0])
  if (!selected) return <EmptyState />
  return (
    <div className="focus-view">
      <div className="focus-wrap">
        <FocusMonitor key={selected.id} src={selected} />
      </div>
      <Strip sources={sources} />
    </div>
  )
}

// ------------------------------------------------------------------ switcher

function MountedMonitor({ which }: { which: 'program' | 'preview' }) {
  const host = useRef<HTMLDivElement>(null)
  const id = useStore((s) => s[which])
  const name = useStore((s) => s.sources.find((x) => x.id === id)?.name ?? '—')
  useEffect(() => {
    const c = video.monitorEl(which)
    host.current?.appendChild(c)
    return () => c.remove()
  }, [which])
  return (
    <figure className={`mon mon-${which}`}>
      <div className="mon-video" ref={host} />
      <figcaption>
        <span className={`tag ${which === 'program' ? 'tag-pgm' : 'tag-pvw'}`}>{which === 'program' ? 'PGM' : 'PVW'}</span>
        <span>{name}</span>
      </figcaption>
    </figure>
  )
}

const TRANSITIONS: { v: TransitionType; label: string }[] = [
  { v: 'mix', label: 'Mix' },
  { v: 'dip', label: 'Dip' },
  { v: 'wipe', label: 'Wipe' },
  { v: 'push', label: 'Push' },
]

function SwitchBar() {
  const st = useStore((s) => ({ t: s.transition, d: s.duration, tbar: s.tbar, ing: s.transitioning, ftb: s.ftb, lt: s.lowerThird.on, burn: s.burnIn }))
  return (
    <div className="switchbar">
      <button className="key" onClick={() => video.cut()} title="Cut (Space)">
        CUT
      </button>
      <button className={`key ${st.ing ? 'is-on' : ''}`} onClick={() => video.auto()} title="Auto transition (Enter)">
        AUTO
      </button>
      <Seg label="Transition" value={st.t} options={TRANSITIONS} onChange={(v) => store.set({ transition: v })} />
      <select aria-label="Transition rate" value={st.d} onChange={(e) => store.set({ duration: Number(e.target.value) })}>
        {[300, 500, 800, 1200, 2000].map((d) => (
          <option key={d} value={d}>
            {(d / 1000).toFixed(1)} s
          </option>
        ))}
      </select>
      <input className="tbar" type="range" min={0} max={1} step={0.001} value={st.tbar} onChange={(e) => video.setTbar(Number(e.target.value))} aria-label="T-bar" />
      <button className={`key key-sm ${st.lt ? 'is-live' : ''}`} onClick={() => store.set((s) => ({ lowerThird: { ...s.lowerThird, on: !s.lowerThird.on } }))} title="Lower third (L)">
        Title
      </button>
      <button className={`key key-sm ${st.burn ? 'is-on' : ''}`} onClick={() => store.set({ burnIn: !st.burn })} title="Burn timecode into the program">
        TC
      </button>
      <button className={`key key-sm ${st.ftb ? 'is-live' : ''}`} onClick={() => store.set({ ftb: !st.ftb })} title="Fade to black (F)">
        FTB
      </button>
    </div>
  )
}

function SwitchView({ sources }: { sources: VideoSource[] }) {
  if (!sources.length) return <EmptyState />
  return (
    <div className="switch-view">
      <div className="mon-row">
        <MountedMonitor which="preview" />
        <MountedMonitor which="program" />
      </div>
      <SwitchBar />
      <Strip sources={sources} />
    </div>
  )
}

// ------------------------------------------------------------------ toolbar & page

const VIEWS: { v: View; label: React.ReactNode; title: string }[] = [
  { v: 'grid', label: <><Icon name="grid" size={13} /> Grid</>, title: 'All cameras (G)' },
  { v: 'focus', label: <><Icon name="focus" size={13} /> Focus</>, title: 'One camera large, with exposure and focus tools (V)' },
  { v: 'switch', label: <><Icon name="switch" size={13} /> Switcher</>, title: 'Preview / program live switching (X)' },
]

const GUIDES: { v: Guides; label: string }[] = [
  { v: 'off', label: 'No guides' },
  { v: 'thirds', label: 'Thirds' },
  { v: 'center', label: 'Centre' },
  { v: 'safe', label: 'Safe areas' },
  { v: 'scope', label: '2.39:1' },
]

function Toolbar() {
  const view = useStore((s) => s.view)
  const mon = useStore((s) => s.monitor)
  const setMon = (p: Partial<typeof mon>) => store.set((s) => ({ monitor: { ...s.monitor, ...p } }))
  return (
    <div className="toolbar">
      <Seg label="View" value={view} options={VIEWS} onChange={(v) => store.set({ view: v })} />
      {view === 'focus' && (
        <div className="tool-group" role="group" aria-label="Monitoring">
          <button className={`chip ${mon.zebra ? 'is-on' : ''}`} aria-pressed={mon.zebra} onClick={() => setMon({ zebra: !mon.zebra })}>
            Zebra
          </button>
          {mon.zebra && (
            <select aria-label="Zebra level" value={mon.zebraLevel} onChange={(e) => setMon({ zebraLevel: Number(e.target.value) })}>
              {[70, 80, 90, 95, 100].map((l) => (
                <option key={l} value={l}>
                  {l}%
                </option>
              ))}
            </select>
          )}
          <button className={`chip ${mon.peaking ? 'is-on' : ''}`} aria-pressed={mon.peaking} onClick={() => setMon({ peaking: !mon.peaking })}>
            Peaking
          </button>
          <button className={`chip ${mon.histogram ? 'is-on' : ''}`} aria-pressed={mon.histogram} onClick={() => setMon({ histogram: !mon.histogram })}>
            Histogram
          </button>
          <select aria-label="Frame guides" value={mon.guides} onChange={(e) => setMon({ guides: e.target.value as Guides })}>
            {GUIDES.map((g) => (
              <option key={g.v} value={g.v}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <span className="grow" />
      <button className="btn btn-ghost btn-sm" onClick={() => store.set({ page: 'setup', setupSection: 'devices' })}>
        <Icon name="plus" size={14} /> Add device
      </button>
      <button className="btn btn-ghost btn-sm only-tablet" onClick={() => store.set((s) => ({ inspectorOpen: !s.inspectorOpen }))}>
        <Icon name="settings" size={14} /> Camera settings
      </button>
    </div>
  )
}

export function LivePage() {
  const sources = useStore((s) => s.sources)
  const view = useStore((s) => s.view)
  const tab = useStore((s) => s.mobileTab)
  const inspectorOpen = useStore((s) => s.inspectorOpen)
  const mixerOpen = useStore((s) => s.mixerOpen)
  return (
    <div className={`live m-${tab} ${mixerOpen ? '' : 'mixer-closed'}`}>
      <section className="live-views" aria-label="Cameras">
        <Toolbar />
        <div className="view-body">
          {view === 'grid' && <GridView sources={sources} />}
          {view === 'focus' && <FocusView sources={sources} />}
          {view === 'switch' && <SwitchView sources={sources} />}
        </div>
      </section>
      <aside className={`live-insp ${inspectorOpen ? 'is-open' : ''}`} aria-label="Camera settings">
        <Inspector />
      </aside>
      {inspectorOpen && <div className="scrim only-tablet" onClick={() => store.set({ inspectorOpen: false })} />}
      <section className="live-mixer" aria-label="Audio">
        <Mixer />
      </section>
      <nav className="m-tabs" aria-label="Panels">
        {(
          [
            ['cams', 'grid', 'Cameras'],
            ['camera', 'settings', 'Camera'],
            ['audio', 'wave', 'Audio'],
          ] as const
        ).map(([id, icon, label]) => (
          <button key={id} className={tab === id ? 'is-on' : ''} aria-current={tab === id} onClick={() => store.set({ mobileTab: id })}>
            <Icon name={icon} size={16} />
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
