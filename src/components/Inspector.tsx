import { useEffect, useRef, useState } from 'react'
import { applyHardware, changeSettings, removeSource, revive, reviving, setMode } from '../engine/devices'
import {
  FOCUS_STOPS,
  ISO_STOPS,
  ND_LABEL,
  ND_STEPS,
  WB_PRESETS,
  apertureStops,
  posOf,
  shutterAngle,
  shutterLabel,
  shutterStops,
  valueAt,
} from '../engine/lens'
import { sendToPhone } from '../engine/phone'
import { store, toast, updateSettings, updateSource, useStore } from '../store'
import { DEFAULT_SETTINGS, type CamSettings, type Profile, type VideoSource } from '../types'
import { Battery, Icon, LINK_LABEL, Signal } from './Icon'
import { HardwareSection, extraKeys } from './HardwareControls'
import { LensRing } from './LensRing'
import { MicInspector } from './MicInspector'
import { Row, Section, Seg, Slide, Switch } from './ui'

const set = changeSettings

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
    // Motorised heads follow the joystick in hardware.
    if (s.hw?.pan || s.hw?.tilt) applyHardware({ ...s, settings: { ...s.settings, pan, tilt } })
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
    set(srcRef.current, { pan: Math.max(-1, Math.min(1, s.pan + dx)), tilt: Math.max(-1, Math.min(1, s.tilt + dy)) })
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


const FOCUS_MAX = FOCUS_STOPS.length - 1

function CameraSection({ src }: { src: VideoSource }) {
  const s = src.settings
  const modes = src.hw?.modes ?? []
  const cur = src.hw?.height ? `${src.hw.width}x${src.hw.height}` : ''
  const curMode = modes.find((m) => `${m.w}x${m.h}` === cur)
  return (
    <Section
      id="camera"
      title="Camera"
      aside={
        <span className="sec-meta">
          {src.signal !== undefined && <Signal bars={src.status === 'live' ? src.signal : 0} />}
          {src.battery !== undefined && <Battery level={src.battery} />}
        </span>
      }
    >
      <Row label="Name" htmlFor="cam-name">
        <input id="cam-name" className="inp" value={src.name} onChange={(e) => updateSource(src.id, { name: e.target.value })} />
      </Row>
      <Row label="Number" htmlFor="cam-num" hint="Used on tiles, slates, file names and the 1–9 keys">
        <input
          id="cam-num"
          className="inp inp-num"
          type="number"
          min={1}
          max={99}
          value={src.number}
          onChange={(e) => {
            const n = Math.max(1, Math.min(99, Number(e.target.value) || 1))
            if (store.get().sources.some((x) => x.id !== src.id && x.number === n)) return toast(`Camera ${n} is already taken`, 'bad')
            updateSource(src.id, { number: n })
          }}
        />
      </Row>
      <Row label="Connection">
        <span className="ro">
          {LINK_LABEL[src.link]} · {src.detail}
        </span>
      </Row>
      {modes.length > 0 && (
        <>
          <Row label="Resolution" htmlFor="cam-res">
            <select
              id="cam-res"
              className="inp"
              value={curMode ? cur : ''}
              onChange={(e) => {
                const m = modes.find((x) => `${x.w}x${x.h}` === e.target.value)
                if (m) void setMode(src, m.w, m.h, m.fps.includes(src.hw?.fps ?? 0) ? src.hw!.fps! : m.fps[m.fps.length - 1])
              }}
            >
              {!curMode && <option value="">{src.hw?.width ? `${src.hw.width}×${src.hw.height}` : 'Auto'}</option>}
              {modes.map((m) => (
                <option key={`${m.w}x${m.h}`} value={`${m.w}x${m.h}`}>
                  {m.h >= 2160 ? '4K UHD' : `${m.h}p`} · {m.w}×{m.h}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Frame rate">
            <Seg
              label="Frame rate"
              value={src.hw?.fps ?? 30}
              options={(curMode?.fps ?? modes[0].fps).map((f) => ({ v: f, label: String(f) }))}
              onChange={(f) => void setMode(src, src.hw?.width ?? 1920, src.hw?.height ?? 1080, f)}
            />
          </Row>
        </>
      )}
      <Row label="Orientation">
        <Seg
          label="Rotation"
          value={s.rotate}
          options={([0, 90, 180, 270] as const).map((r) => ({ v: r, label: `${r}°` }))}
          onChange={(r) => set(src, { rotate: r })}
        />
      </Row>
      <Row label="Mirror">
        <Switch label="Mirror" on={s.mirror} onChange={(v) => set(src, { mirror: v })} />
      </Row>
      {(src.hw?.torch || src.kind === 'phone') && (
        <Row label="Phone">
          <div className="row">
            {src.hw?.torch && (
              <button className={`chip ${s.torch ? 'is-on' : ''}`} aria-pressed={s.torch} onClick={() => set(src, { torch: !s.torch })}>
                <Icon name="flash" size={12} /> Torch
              </button>
            )}
            {src.kind === 'phone' && (
              <button className="chip" onClick={() => sendToPhone(src.id, { type: 'flip' })}>
                <Icon name="flip" size={12} /> Flip camera
              </button>
            )}
          </div>
        </Row>
      )}
      <HwSummary src={src} />
      {src.status !== 'live' && (
        <p className="warn">
          {src.status !== 'lost'
            ? 'Connecting…'
            : reviving(src.id)
              ? 'Signal lost — reconnecting. If another app (another tab, the Cortiva app, Teams, Camera…) is using this camera, close it.'
              : 'Signal lost — waiting for the device to come back.'}
          {src.status === 'lost' && reviving(src.id) && (
            <>
              {' '}
              <button className="linkbtn" onClick={() => void revive(src.id)}>
                Try now
              </button>
            </>
          )}
        </p>
      )}
      {src.tainted && <p className="warn">This network stream blocks capture (no CORS headers): it shows here but can't be recorded.</p>}
    </Section>
  )
}

/** What the camera told us it can do, so missing controls are explained rather than just absent. */
function HwSummary({ src }: { src: VideoSource }) {
  const hw = src.hw ?? {}
  const names: string[] = []
  if (hw.zoom) names.push('zoom')
  if (hw.pan || hw.tilt) names.push('pan/tilt')
  if (hw.focus) names.push('focus')
  if (hw.shutter) names.push('shutter')
  if (hw.iso) names.push('ISO')
  if (hw.ev) names.push('exposure comp.')
  if (hw.wb) names.push('white balance')
  if (hw.sharpness) names.push('sharpness')
  if (hw.torch) names.push('torch')
  const extra = extraKeys(src).length
  if (!hw.raw) {
    // IP cameras and screen shares have no camera controls to report.
    if (src.kind === 'url' || src.kind === 'screen') return null
    return <p className="hint">This browser doesn't report camera controls. Chrome or Edge show every setting the camera supports.</p>
  }
  return (
    <Row label="Camera controls">
      <span className="ro-wrap">
        {names.length || extra ? `${[...names, extra ? `${extra} more below` : ''].filter(Boolean).join(', ')}` : 'None reported by this camera'}
      </span>
    </Row>
  )
}

function RecordSection({ src }: { src: VideoSource }) {
  const hasRaw = src.kind !== 'url'
  return (
    <Section id="record" title="Recording" aside={<span className={`sec-meta ${src.rec.armed ? 'is-armed' : ''}`}>{src.rec.armed ? 'Armed' : 'Off'}</span>}>
      <Row label="Record this camera" hint="Armed cameras each write their own file when you press REC">
        <Switch label="Arm for recording" on={src.rec.armed} onChange={(v) => updateSource(src.id, { rec: { ...src.rec, armed: v } })} />
      </Row>
      <Row label="Feed">
        <Seg
          label="Recorded feed"
          value={src.rec.feed}
          disabled={!hasRaw}
          options={[
            { v: 'clean', label: 'Clean', title: 'The camera’s native picture at full resolution' },
            { v: 'processed', label: 'Processed', title: 'With the image adjustments and sync delay from this app' },
          ]}
          onChange={(v) => updateSource(src.id, { rec: { ...src.rec, feed: v } })}
        />
      </Row>
      <p className="hint">
        {src.rec.feed === 'clean'
          ? 'Full-resolution camera signal. Hardware settings (focus, shutter, white balance…) are baked in; digital adjustments are not.'
          : 'Records what you see here, including digital image adjustments and the lip-sync delay.'}
        {src.kind === 'phone' ? ' The phone also records its own full-quality copy.' : ''}
        {!hasRaw ? ' Network cameras have no separate clean signal, so they always record processed.' : ''}
      </p>
    </Section>
  )
}

function LensSection({ src }: { src: VideoSource }) {
  const s = src.settings
  const hw = src.hw ?? {}
  const shown = s.focus
  const ap = hw.aperture ? apertureStops(hw.aperture) : null
  const [storing, setStoring] = useState(false)
  useEffect(() => setStoring(false), [src.id])
  const zoomKind = hw.zoom ? 'camera' : 'digital'
  return (
    <Section id="lens" title={src.ptz || src.hw?.pan || src.hw?.tilt ? 'Lens & PTZ' : 'Lens & framing'}>
      <div className="ptz">
        <PtzPad src={src} />
        <div className="ptz-side">
          <Slide label={`Zoom (${zoomKind})`} value={s.zoom} min={1} max={4} step={0.01} format={(v) => `${v.toFixed(1)}×`} onChange={(v) => set(src, { zoom: v })} reset={1} id="zoom" />
          <button className="btn btn-sm" onClick={() => recall(src, { zoom: 1, pan: 0, tilt: 0 })}>
            Home
          </button>
          {!src.ptz && !hw.pan && !hw.tilt && s.zoom <= 1.01 && <p className="hint">Zoom in to reframe inside the picture.</p>}
        </div>
      </div>
      <div className="presets" role="group" aria-label="Presets">
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
          {storing ? 'Pick' : 'Store'}
        </button>
      </div>
      {hw.focus ? (
        <>
          <Row label="Autofocus">
            <Switch label="Autofocus" on={s.autoFocus} onChange={(v) => set(src, v ? { autoFocus: true } : { autoFocus: false, focus: shown })} />
          </Row>
          <LensRing
            label="Focus"
            stops={FOCUS_STOPS}
            pos={shown * FOCUS_MAX}
            onPos={(p) => set(src, { focus: p / FOCUS_MAX, autoFocus: false })}
            readout={s.autoFocus ? 'AF' : `${(hw.focus[0] + s.focus * (hw.focus[1] - hw.focus[0])).toFixed(2)} m`}
          />
        </>
      ) : null}
      {ap && (
        <LensRing label="Iris" stops={ap} pos={posOf(ap, s.aperture)} onPos={(p) => set(src, { aperture: Math.round(valueAt(ap, p) * 10) / 10 })} readout={`f/${s.aperture.toFixed(1)}`} />
      )}
    </Section>
  )
}

function ExposureSection({ src }: { src: VideoSource }) {
  const s = src.settings
  const hw = src.hw ?? {}
  const fps = useStore((st) => st.fps)
  const sh = hw.shutter ? shutterStops(hw.shutter) : null
  const isoStops = hw.iso ? ISO_STOPS.filter((x) => x.v >= hw.iso![0] && x.v <= hw.iso![1]) : null
  const angle = shutterAngle(s.shutter, hw.fps ?? fps)
  const manualAvailable = !!(sh || isoStops)
  return (
    <Section id="exposure" title="Exposure">
      {manualAvailable && (
        <Row label="Mode">
          <Seg
            label="Exposure mode"
            value={s.autoExposure ? 'auto' : 'manual'}
            options={[
              { v: 'auto', label: 'Auto' },
              { v: 'manual', label: 'Manual' },
            ]}
            onChange={(v) => set(src, v === 'auto' ? { autoExposure: true } : { autoExposure: false })}
          />
        </Row>
      )}
      {sh && (
        <>
          <LensRing label="Shutter" stops={sh} pos={posOf(sh, s.shutter)} onPos={(p) => set(src, { shutter: valueAt(sh, p) })} readout={`${shutterLabel(s.shutter)} · ${angle}°`} detent />
          {Math.abs(angle - 180) > 40 && <p className="hint">180° (1/{(hw.fps ?? fps) * 2}) gives natural motion blur at {hw.fps ?? fps} fps.</p>}
        </>
      )}
      {isoStops && isoStops.length > 1 && (
        <LensRing
          label="ISO"
          stops={isoStops}
          pos={posOf(isoStops, s.iso)}
          onPos={(p) => set(src, { iso: Math.round(valueAt(isoStops, Math.round(p))), autoExposure: false })}
          readout={s.autoExposure ? 'Auto' : String(s.iso)}
          detent
          disabled={s.autoExposure}
        />
      )}
      {hw.nd && (
        <Row label="ND filter">
          <Seg label="ND filter" value={s.nd} options={ND_STEPS.map((n) => ({ v: n, label: ND_LABEL[n] }))} onChange={(n) => set(src, { nd: n })} />
        </Row>
      )}
      <Slide
        label={hw.ev ? 'Exposure comp. (camera)' : 'Exposure comp.'}
        value={s.exposure}
        min={-2}
        max={2}
        step={0.1}
        format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} EV`}
        onChange={(v) => set(src, { exposure: v })}
        reset={0}
        id="ev"
      />
    </Section>
  )
}

const PROFILES: { v: Profile; label: string }[] = [
  { v: 'standard', label: 'Standard' },
  { v: 'flat', label: 'Flat' },
  { v: 'vivid', label: 'Vivid' },
  { v: 'mono', label: 'Mono' },
]

const COLOR_KEYS: (keyof CamSettings)[] = ['whiteBalance', 'autoWhiteBalance', 'tint', 'profile', 'saturation', 'contrast', 'sharpness', 'exposure']

function ColorSection({ src }: { src: VideoSource }) {
  const s = src.settings
  const hw = src.hw ?? {}
  return (
    <Section id="color" title="Colour & image">
      <Row label="White balance">
        <Seg
          label="White balance mode"
          value={s.autoWhiteBalance ? 'auto' : 'manual'}
          options={[
            { v: 'auto', label: 'Auto' },
            { v: 'manual', label: 'Manual' },
          ]}
          onChange={(v) => set(src, { autoWhiteBalance: v === 'auto' })}
        />
      </Row>
      {!s.autoWhiteBalance && (
        <>
          <div className="wb-presets" role="group" aria-label="White balance presets">
            {WB_PRESETS.map((p) => (
              <button key={p.k} className={`chip ${s.whiteBalance === p.k ? 'is-on' : ''}`} onClick={() => set(src, { whiteBalance: p.k })}>
                {p.label} <span className="mono">{p.k}</span>
              </button>
            ))}
          </div>
          <Slide label="Kelvin" value={s.whiteBalance} min={hw.wb?.[0] ?? 2800} max={hw.wb?.[1] ?? 7500} step={50} format={(v) => `${v} K`} onChange={(v) => set(src, { whiteBalance: v })} reset={5600} id="kelvin" />
        </>
      )}
      <Slide label="Tint" value={s.tint} min={-50} max={50} step={1} format={(v) => (v === 0 ? '0' : v < 0 ? `G${-v}` : `M${v}`)} onChange={(v) => set(src, { tint: v })} reset={0} id="tint" />
      <Row label="Profile">
        <Seg label="Picture profile" value={s.profile} options={PROFILES} onChange={(v) => set(src, { profile: v })} />
      </Row>
      <Slide label="Saturation" value={s.saturation} min={0} max={2} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set(src, { saturation: v })} reset={1} id="sat" />
      <Slide label="Contrast" value={s.contrast} min={0.5} max={1.5} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set(src, { contrast: v })} reset={1} id="con" />
      {hw.sharpness && <Slide label="Sharpness" value={s.sharpness} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set(src, { sharpness: v })} reset={0.5} id="sharp" />}
      <div className="row sec-actions">
        <button
          className="btn btn-sm"
          onClick={() => {
            const patch = Object.fromEntries(COLOR_KEYS.map((k) => [k, s[k]])) as Partial<CamSettings>
            store.get().sources.forEach((x) => x.id !== src.id && set(x, patch))
            toast(`Colour from ${src.name} copied to all cameras`, 'good')
          }}
        >
          <Icon name="copy" size={13} /> Match all cameras
        </button>
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => set(src, Object.fromEntries(COLOR_KEYS.map((k) => [k, DEFAULT_SETTINGS[k]])) as Partial<CamSettings>)}
        >
          Reset
        </button>
      </div>
    </Section>
  )
}

function CameraInspector() {
  const src = useStore((s) => s.sources.find((x) => x.id === s.selected) ?? s.sources[0])
  const recording = useStore((s) => !!s.recordingSince)
  if (!src) {
    return (
      <div className="insp-empty">
        <Icon name="cam" size={22} />
        <p>Select a camera to adjust it.</p>
      </div>
    )
  }
  return (
    <div className="insp-body" key={src.id}>
      <div className="insp-cam">
        <span className="t-num">{src.number}</span>
        <b>{src.name}</b>
      </div>
      <CameraSection src={src} />
      <RecordSection src={src} />
      <LensSection src={src} />
      <ExposureSection src={src} />
      <ColorSection src={src} />
      <HardwareSection src={src} />
      <div className="insp-foot">
        <button
          className="btn btn-sm btn-danger"
          disabled={recording}
          title={recording ? 'Stop recording before removing a camera' : undefined}
          onClick={() => {
            removeSource(src.id)
            toast(`${src.name} removed`, 'info')
          }}
        >
          <Icon name="trash" size={13} /> Remove camera
        </button>
      </div>
    </div>
  )
}

/** Settings for the selected camera or microphone. */
export function Inspector() {
  const mode = useStore((s) => s.inspect)
  return (
    <div className="insp">
      <header className="insp-head">
        <Seg
          label="Settings for"
          value={mode}
          options={[
            { v: 'camera', label: <><Icon name="cam" size={13} /> Camera</> },
            { v: 'mic', label: <><Icon name="mic" size={13} /> Mic</> },
          ]}
          onChange={(v) => store.set({ inspect: v })}
        />
        <span className="grow" />
        <button className="icon-btn only-tablet" aria-label="Close settings" onClick={() => store.set({ inspectorOpen: false })}>
          <Icon name="close" size={14} />
        </button>
      </header>
      {mode === 'camera' ? <CameraInspector /> : <MicInspector />}
    </div>
  )
}
