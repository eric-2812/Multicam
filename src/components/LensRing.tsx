import { useRef } from 'react'
import type { Stop } from '../engine/lens'

const SPACING = 44 // px between engraved stops

/**
 * A lens barrel seen from above: drag it sideways (or scroll / use arrow keys) to turn it.
 * The scale moves under a fixed index mark, like a cine lens focus ring.
 */
export function LensRing(props: {
  label: string
  stops: Stop[]
  /** Continuous position, 0 … stops.length − 1. */
  pos: number
  onPos: (pos: number) => void
  readout: string
  /** Click into whole stops (shutter). */
  detent?: boolean
  disabled?: boolean
  /** Mark showing where autofocus / the subject sits. */
  marker?: number
  accent?: string
}) {
  const { stops, pos, onPos, detent, disabled } = props
  const max = stops.length - 1
  const drag = useRef<{ x: number; pos: number } | null>(null)
  const clamp = (v: number) => Math.max(0, Math.min(max, v))
  const emit = (v: number) => onPos(detent ? Math.round(clamp(v)) : clamp(v))

  return (
    <div className={`ring ${disabled ? 'is-disabled' : ''}`} style={props.accent ? ({ '--ring-accent': props.accent } as React.CSSProperties) : undefined}>
      <div className="ring-head">
        <span>{props.label}</span>
        <output>{props.readout}</output>
      </div>
      <div
        className="ring-body"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={props.label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.round(pos * 100) / 100}
        aria-valuetext={props.readout}
        aria-disabled={disabled}
        onPointerDown={(e) => {
          if (disabled) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { x: e.clientX, pos }
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          emit(drag.current.pos - (e.clientX - drag.current.x) / SPACING)
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onWheel={(e) => {
          if (disabled) return
          const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
          emit(pos + Math.sign(d) * (detent ? 1 : 0.12))
        }}
        onKeyDown={(e) => {
          if (disabled) return
          const step = detent ? 1 : e.shiftKey ? 0.5 : 0.1
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') emit(pos - step)
          else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') emit(pos + step)
          else if (e.key === 'Home') emit(0)
          else if (e.key === 'End') emit(max)
          else return
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        <div className="ring-grip" style={{ backgroundPositionX: `${-pos * SPACING}px` }} />
        <div className="ring-scale" style={{ transform: `translateX(${-pos * SPACING}px)` }}>
          {stops.map((s, i) => (
            <span key={i} className="ring-stop" style={{ left: i * SPACING }}>
              <i />
              {s.label}
            </span>
          ))}
          {stops.slice(0, -1).map((_, i) => (
            <i key={`m${i}`} className="ring-minor" style={{ left: i * SPACING + SPACING / 2 }} />
          ))}
          {props.marker !== undefined && <b className="ring-marker" style={{ left: props.marker * SPACING }} title="Subject" />}
        </div>
        <span className="ring-index" aria-hidden />
      </div>
    </div>
  )
}
