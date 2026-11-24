import { useEffect, useRef, useState } from 'react'
import { applyHardware, removeSource } from '../engine/devices'
import { sendToPhone } from '../engine/phone'
import { store, updateSettings, updateSource, useStore } from '../store'
import { DEFAULT_SETTINGS, type CamSettings, type VideoSource } from '../types'
import { FOCUS_STOPS, apertureStops, exposureModel, focusLabel, posOf, shutterLabel, shutterStops, subjectFocus, valueAt } from '../engine/lens'
import { Battery, Icon, LinkBadge, Signal } from './Icon'
import { LensRing } from './LensRing'

function set(src: VideoSource, patch: Partial<CamSettings>) {
  updateSettings(src.id, patch)
  if (['zoom', 'torch', 'focus', 'autoFocus', 'shutter'].some((k) => k in patch)) {
    const next = store.get().sources.find((s) => s.id === src.id)
    if (next) applyHardware(next)
  }
}

/** Ease a PTZ head toward a stored preset, like a real motorised camera. */
const moving = new Map<string, number>()
function recall(src: VideoSource, target: { zoom: number; pan: number; tilt: number }) {
  cancelAnimationFrame(moving.get(src.id) ?? 0)
  const from = { zoom: src.settings.zoom, pan: src.settings.pan, tilt: src.settings.tilt }
  const t0 = performance.now()
  const dur = src.ptz ? 1100 : 1
  const step = () => {
    const p = Math.min(1, (performance.now() - t0) / dur)
    const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
    set(src, {
      zoom: from.zoom + (target.zoom - from.zoom) * e,
      pan: from.pan + (target.pan - from.pan) * e,
      tilt: from.tilt + (target.tilt - from.tilt) * e,
    })
    if (p < 1) moving.set(src.id, requestAnimationFrame(step))
  }
  step()
}

/** Joystick: distance from centre sets the speed, like a PTZ controller. */
function PtzPad({ src }: { src: VideoSource }) {
  const pad = useRef<HTMLDivElement>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const vel = useRef({ x: 0, y: 0 })
  const srcRef = useRef(src)
  srcRef.current = src
  const raf = useRef(0)

  const loop = () => {
    const s = srcRef.current
    const k = 0.018 / Math.sqrt(s.settings.zoom)
    const pan = Math.max(-1, Math.min(1, s.settings.pan + vel.current.x * k))
    const tilt = Math.max(-1, Math.min(1, s.settings.tilt + vel.current.y * k))
    updateSettings(s.id, { pan, tilt })
    raf.current = requestAnimationFrame(loop)
  }

  const move = (e: React.PointerEvent) => {
    const r = pad.current!.getBoundingClientRect()
    let x = ((e.clientX - r.left) / r.width) * 2 - 1
    let y = ((e.clientY - r.top) / r.height) * 2 - 1
    const m = Math.hypot(x, y)
    if (m > 1) {
      x /= m
      y /= m
    }
    vel.current = { x, y }
    setKnob({ x, y })
  }
  const end = () => {
    cancelAnimationFrame(raf.current)
    vel.current = { x: 0, y: 0 }
    setKnob({ x: 0, y: 0 })
  }
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const nudge = (dx: number, dy: number) => {
    const s = srcRef.current.settings
    updateSettings(src.id, { pan: Math.max(-1, Math.min(1, s.pan + dx)), tilt: Math.max(-1, Math.min(1, s.tilt + dy)) })
  }

  return (
    <div
      className="ptz-pad"
      ref={pad}
      tabIndex={0}
      role="application"
      aria-label="Pan and tilt. Drag, or use the arrow keys."
      onPointerDown={(e) => {
        pad.current!.setPointerCapture(e.pointerId)
        move(e)
        cancelAnimationFrame(raf.current)
        raf.current = requestAnimationFrame(loop)
      }}
      onPointerMove={(e) => e.buttons && move(e)}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={(e) => {
        const d = 0.05
        if (e.key === 'ArrowLeft') nudge(-d, 0)
        else if (e.key === 'ArrowRight') nudge(d, 0)
        else if (e.key === 'ArrowUp') nudge(0, -d)
        else if (e.key === 'ArrowDown') nudge(0, d)
        else return
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <span className="ptz-cross" />
      <span className="ptz-pos" style={{ left: `${50 + src.settings.pan * 50}%`, top: `${50 + src.settings.tilt * 50}%` }} />
      <span className="ptz-knob" style={{ transform: `translate(${knob.x * 52}px, ${knob.y * 52}px)` }} />
    </div>
  )
}

function Slider(props: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
  disabled?: boolean
  center?: number
}) {
  return (
    <label className={`slider ${props.disabled ? 'is-disabled' : ''}`}>
      <span className="slider-head">
        <span>{props.label}</span>
        <output>{props.format(props.value)}</output>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(Number(e.target.value))}
        onDoubleClick={() => props.center !== undefined && props.onChange(props.center)}
      />
    </label>
  )
}

export function Inspector() {
  const selected = useStore((s) => s.selected)
  const src = useStore((s) => s.sources.find((x) => x.id === s.selected))
  const program = useStore((s) => s.program)
  const [storing, setStoring] = useState(false)

  useEffect(() => setStoring(false), [selected])

  if (!src) {
    return (
      <aside className="inspector inspector-empty">
        <Icon name="cam" size={28} />
        <p>Select a camera to control it.</p>
      </aside>
    )
  }
  const s = src.settings
  const zoomKind = src.kind === 'demo' ? (src.ptz ? 'optical' : 'lens') : src.hw?.zoom ? 'hardware' : 'digital'
  const res = src.hw?.width ? `${src.hw.width}×${src.hw.height}${src.hw.fps ? ` · ${src.hw.fps}fps` : ''}` : src.kind === 'demo' ? '1920×1080 · 30fps' : ''

  return (
    <aside className="inspector" aria-label={`${src.name} controls`}>
      <div className="insp-head">
        <input className="insp-name" value={src.name} onChange={(e) => updateSource(src.id, { name: e.target.value })} aria-label="Camera name" />
        <div className="insp-meta">
          <LinkBadge link={src.link} />
          {src.signal !== undefined && <Signal bars={src.status === 'live' ? src.signal : 0} />}
          {src.battery !== undefined && <Battery level={src.battery} />}
          {program === src.id && <span className="tally-tag pgm">ON AIR</span>}
        </div>
        <p className="insp-detail">
          {src.detail}
          {res && <span> · {res}</span>}
        </p>
        {src.status !== 'live' && <p className="insp-warn">{src.status === 'lost' ? 'Signal lost — waiting for the device to come back.' : 'Connecting…'}</p>}
        {src.tainted && <p className="insp-warn">This network stream blocks capture (no CORS headers): it can be shown, but recordings and stills will fail while it is used.</p>}
      </div>

      <div className="insp-section">
        <h3>{src.ptz ? 'Pan / tilt' : 'Reframe'}</h3>
        <div className="ptz">
          <PtzPad src={src} />
          <div className="ptz-side">
            <Slider label={`Zoom · ${zoomKind}`} value={s.zoom} min={1} max={4} step={0.01} format={(v) => `${v.toFixed(1)}×`} onChange={(v) => set(src, { zoom: v })} center={1} />
            <button className="btn btn-ghost btn-sm" onClick={() => recall(src, { zoom: 1, pan: 0, tilt: 0 })}>
              Home
            </button>
          </div>
        </div>
        {!src.ptz && s.zoom <= 1.01 && <p className="hint">Zoom in to reframe inside the picture.</p>}
        <div className="presets">
          {src.presets.map((p, i) => (
            <button
              key={i}
              className={`preset ${p ? 'has' : ''} ${storing ? 'storing' : ''}`}
              onClick={() => {
                if (storing) {
                  const presets = [...src.presets]
                  presets[i] = { zoom: s.zoom, pan: s.pan, tilt: s.tilt }
                  updateSource(src.id, { presets })
                  setStoring(false)
                } else if (p) recall(src, p)
              }}
              title={storing ? `Store preset ${i + 1}` : p ? `Recall preset ${i + 1}` : 'Empty — press Store first'}
            >
              {i + 1}
            </button>
          ))}
          <button className={`preset preset-store ${storing ? 'is-on' : ''}`} onClick={() => setStoring((v) => !v)}>
            {storing ? 'Pick…' : 'Store'}
          </button>
        </div>
      </div>

      <LensSection src={src} />

      <div className="insp-section">
        <h3>Image</h3>
        <Slider label="Exposure" value={s.exposure} min={-2} max={2} step={0.1} format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} EV`} onChange={(v) => set(src, { exposure: v })} center={0} />
        <Slider label="White balance" value={s.whiteBalance} min={2800} max={7500} step={50} format={(v) => `${v} K`} onChange={(v) => set(src, { whiteBalance: v })} center={5600} />
        <Slider label="Saturation" value={s.saturation} min={0} max={2} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set(src, { saturation: v })} center={1} />
        <Slider label="Contrast" value={s.contrast} min={0.5} max={1.5} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set(src, { contrast: v })} center={1} />
        <div className="row">
          <button className={`chip ${s.mirror ? 'is-on' : ''}`} onClick={() => set(src, { mirror: !s.mirror })} aria-pressed={s.mirror}>
            Mirror
          </button>
          {src.hw?.torch && (
            <button className={`chip ${s.torch ? 'is-on' : ''}`} onClick={() => set(src, { torch: !s.torch })} aria-pressed={s.torch}>
              <Icon name="flash" size={12} /> Torch
            </button>
          )}
          {src.kind === 'phone' && (
            <button className="chip" onClick={() => sendToPhone(src.id, { type: 'flip' })}>
              <Icon name="flip" size={12} /> Flip camera
            </button>
          )}
          <span className="grow" />
          <button className="btn btn-ghost btn-sm" onClick={() => set(src, { exposure: DEFAULT_SETTINGS.exposure, whiteBalance: DEFAULT_SETTINGS.whiteBalance, saturation: 1, contrast: 1, mirror: false })}>
            Reset image
          </button>
        </div>
        <p className="hint">Double-click a slider to reset it.</p>
      </div>

      <Accessories />

      <div className="insp-foot">
        <button className="btn btn-danger btn-sm" onClick={() => removeSource(src.id)}>
          <Icon name="trash" size={14} /> Remove camera
        </button>
      </div>
    </aside>
  )
}

const FOCUS_MAX = FOCUS_STOPS.length - 1

function LensSection({ src }: { src: VideoSource }) {
  const s = src.settings
  const hw = src.hw ?? {}
  const sim = src.kind === 'demo'
  const subject = sim ? subjectFocus(src) : undefined
  if (!hw.focus && !hw.aperture && !hw.shutter) {
    return (
      <div className="insp-section">
        <h3>Lens</h3>
        <p className="hint">
          This camera doesn’t offer remote focus, iris or shutter control
          {sim ? '.' : ' to the browser — they only appear when the camera’s driver exposes them (common on phones and some USB webcams).'}
        </p>
      </div>
    )
  }
  const shown = s.autoFocus && subject !== undefined ? subject : s.focus
  const ap = hw.aperture ? apertureStops(hw.aperture) : null
  const sh = hw.shutter ? shutterStops(hw.shutter) : null
  const exp = sim ? exposureModel(s, hw) : null
  return (
    <div className="insp-section">
      <h3>
        Lens
        {exp && (
          <span className={`iso ${exp.isoStops >= 7 ? 'is-max' : ''}`} title="Auto-ISO compensates for iris and shutter">
            ISO {exp.iso} auto
          </span>
        )}
      </h3>
      {hw.focus && (
        <>
          <div className="ring-tools">
            <button
              className={`chip ${s.autoFocus ? 'is-on' : ''}`}
              aria-pressed={s.autoFocus}
              onClick={() => set(src, s.autoFocus ? { autoFocus: false, focus: shown } : { autoFocus: true })}
            >
              AF
            </button>
            <span className="hint">{s.autoFocus ? 'Autofocus on — tap AF to pull focus by hand' : 'Manual focus'}</span>
          </div>
          <LensRing
            label="Focus"
            stops={FOCUS_STOPS}
            pos={shown * FOCUS_MAX}
            onPos={(p) => set(src, { focus: p / FOCUS_MAX, autoFocus: false })}
            readout={
              sim
                ? s.autoFocus
                  ? `AF · ${focusLabel(shown)}`
                  : focusLabel(s.focus)
                : s.autoFocus
                  ? 'AF'
                  : `${(hw.focus[0] + s.focus * (hw.focus[1] - hw.focus[0])).toFixed(2)} m`
            }
            marker={subject !== undefined ? subject * FOCUS_MAX : undefined}
          />
        </>
      )}
      {ap && (
        <LensRing
          label="Aperture"
          stops={ap}
          pos={posOf(ap, s.aperture)}
          onPos={(p) => set(src, { aperture: Math.round(valueAt(ap, p) * 10) / 10 })}
          readout={`f/${s.aperture.toFixed(1)}`}
          accent="#7fd8ff"
        />
      )}
      {sh && (
        <LensRing
          label="Shutter"
          stops={sh}
          pos={posOf(sh, s.shutter)}
          onPos={(p) => set(src, { shutter: valueAt(sh, p) })}
          readout={shutterLabel(s.shutter)}
          detent
          accent="#c4a6ff"
        />
      )}
      {sim && hw.focus && <p className="hint">The amber mark on the focus ring is where the subject is. Open the iris for shallower depth of field; slow shutters add motion blur.</p>}
    </div>
  )
}

function Accessories() {
  const acc = useStore((s) => s.accessories)
  if (!acc.length) return null
  return (
    <div className="insp-section">
      <h3>Accessories</h3>
      <ul className="acc-list">
        {acc.map((a) => (
          <li key={a.id} className={a.status === 'lost' ? 'is-down' : ''}>
            <LinkBadge link={a.link} />
            <span className="acc-name">
              {a.name}
              <small>{a.status === 'lost' ? 'Disconnected' : a.detail}</small>
            </span>
            {a.battery !== undefined && <Battery level={a.battery} />}
            <button
              className="icon-btn"
              aria-label={`Forget ${a.name}`}
              onClick={() => store.set((st) => ({ accessories: st.accessories.filter((x) => x.id !== a.id) }))}
            >
              <Icon name="close" size={12} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
