import { useEffect, useRef, useState } from 'react'
import { setRawControl } from '../engine/devices'
import type { HwCaps, RawCap, VideoSource } from '../types'
import { Row, Section, Seg, Slide, Switch } from './ui'

/** Never shown: identity or layout properties, not camera settings. */
const SKIP = new Set(['deviceId', 'groupId', 'facingMode', 'aspectRatio', 'resizeMode', 'displaySurface', 'logicalSurface', 'cursor'])

const LABELS: Record<string, string> = {
  brightness: 'Brightness',
  contrast: 'Contrast',
  saturation: 'Saturation',
  sharpness: 'Sharpness',
  exposureMode: 'Exposure mode',
  exposureTime: 'Exposure time',
  exposureCompensation: 'Exposure comp.',
  iso: 'ISO',
  whiteBalanceMode: 'White balance mode',
  colorTemperature: 'Colour temperature',
  focusMode: 'Focus mode',
  focusDistance: 'Focus distance',
  zoom: 'Zoom',
  pan: 'Pan',
  tilt: 'Tilt',
  torch: 'Torch',
  width: 'Width',
  height: 'Height',
  frameRate: 'Frame rate',
  backgroundBlur: 'Background blur',
  backgroundSegmentationMask: 'Background mask',
  eyeGazeCorrection: 'Eye-gaze correction',
  faceFraming: 'Face framing',
  lightingCorrection: 'Lighting correction',
  powerEfficient: 'Power saving',
}

function label(k: string) {
  return LABELS[k] ?? k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
}

/** The keys already driven by the dedicated lens / exposure / colour controls. */
export function coveredKeys(hw: HwCaps) {
  const c = new Set<string>()
  if (hw.zoom) c.add('zoom')
  if (hw.pan) c.add('pan')
  if (hw.tilt) c.add('tilt')
  if (hw.torch) c.add('torch')
  if (hw.focus) c.add('focusDistance').add('focusMode')
  if (hw.shutter) c.add('exposureTime')
  if (hw.shutter || hw.iso) c.add('exposureMode')
  if (hw.iso) c.add('iso')
  if (hw.wb) c.add('colorTemperature').add('whiteBalanceMode')
  if (hw.ev) c.add('exposureCompensation')
  if (hw.sharpness) c.add('sharpness')
  if (hw.modes?.length) c.add('width').add('height').add('frameRate')
  return c
}

/** Settings this camera reports that have no dedicated control. */
export function extraKeys(src: VideoSource) {
  const raw = src.hw?.raw
  if (!raw) return []
  const cov = coveredKeys(src.hw!)
  return Object.keys(raw.caps).filter((k) => !SKIP.has(k) && !cov.has(k))
}

function RangeControl({ src, k, cap, value }: { src: VideoSource; k: string; cap: { min: number; max: number; step?: number }; value: unknown }) {
  const [local, setLocal] = useState<number | null>(null)
  const timer = useRef(0)
  useEffect(() => setLocal(null), [value])
  const step = cap.step && cap.step > 0 ? cap.step : (cap.max - cap.min) / 100
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2
  const v = local ?? (typeof value === 'number' ? value : (cap.min + cap.max) / 2)
  return (
    <Slide
      id={`hw-${k}`}
      label={label(k)}
      value={v}
      min={cap.min}
      max={cap.max}
      step={step}
      format={(x) => x.toFixed(decimals)}
      onChange={(x) => {
        setLocal(x)
        clearTimeout(timer.current)
        timer.current = window.setTimeout(() => void setRawControl(src, k, x), 80)
      }}
    />
  )
}

function RawControl({ src, k, cap, value }: { src: VideoSource; k: string; cap: RawCap; value: unknown }) {
  if (typeof cap === 'boolean') {
    return (
      <Row label={label(k)}>
        <Switch label={label(k)} on={value === true} onChange={(v) => void setRawControl(src, k, v)} />
      </Row>
    )
  }
  if (Array.isArray(cap)) {
    if (cap.every((x) => typeof x === 'boolean')) {
      // [true, false] means it can be switched; a single value means it's fixed.
      if (cap.length < 2) return <Row label={label(k)}><span className="ro">{String(cap[0] ?? value ?? '—')}</span></Row>
      return (
        <Row label={label(k)}>
          <Switch label={label(k)} on={value === true} onChange={(v) => void setRawControl(src, k, v)} />
        </Row>
      )
    }
    const opts = cap.map(String)
    if (opts.length < 2) return <Row label={label(k)}><span className="ro">{opts[0] ?? String(value ?? '—')}</span></Row>
    return (
      <Row label={label(k)}>
        <Seg label={label(k)} value={String(value ?? '')} options={opts.map((o) => ({ v: o, label: o.replace(/-/g, ' ') }))} onChange={(o) => void setRawControl(src, k, o)} />
      </Row>
    )
  }
  if (cap.max <= cap.min) return <Row label={label(k)}><span className="ro mono">{String(value ?? cap.min)}</span></Row>
  return <RangeControl src={src} k={k} cap={cap} value={value} />
}

/** Every other setting the camera itself reports, with a control for each. */
export function HardwareSection({ src }: { src: VideoSource }) {
  const keys = extraKeys(src)
  if (!keys.length) return null
  const raw = src.hw!.raw!
  return (
    <Section id="hardware" title="Camera hardware" aside={<span className="sec-meta">{keys.length} more</span>}>
      {keys.map((k) => (
        <RawControl key={k} src={src} k={k} cap={raw.caps[k]} value={raw.settings[k]} />
      ))}
      <p className="hint">Reported and applied by the camera itself, so they're in clean recordings too.</p>
    </Section>
  )
}
