import { useRef } from 'react'

/** Console-style vertical fader with a unity mark. Drag, scroll, or use the arrow keys. */
export function Fader(props: { value: number; max: number; unity: number; onChange: (v: number) => void; label: string; valueText: string }) {
  const { value, max, unity, onChange } = props
  const track = useRef<HTMLDivElement>(null)
  const clamp = (v: number) => Math.max(0, Math.min(max, v))
  const fromY = (y: number) => {
    const r = track.current!.getBoundingClientRect()
    return clamp((1 - (y - r.top) / r.height) * max)
  }
  const pct = (v: number) => `${(1 - v / max) * 100}%`
  return (
    <div
      className="fader"
      role="slider"
      tabIndex={0}
      aria-label={props.label}
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value * 100) / 100}
      aria-valuetext={props.valueText}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        onChange(fromY(e.clientY))
      }}
      onPointerMove={(e) => e.buttons && onChange(fromY(e.clientY))}
      onDoubleClick={() => onChange(unity)}
      onWheel={(e) => onChange(clamp(value - Math.sign(e.deltaY) * 0.03))}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 0.1 : 0.02
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(clamp(value + step))
        else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(clamp(value - step))
        else if (e.key === 'Home') onChange(0)
        else if (e.key === 'End') onChange(max)
        else return
        e.preventDefault()
      }}
    >
      <div className="fader-track" ref={track}>
        <span className="fader-unity" style={{ top: pct(unity) }} />
        <span className="fader-cap" style={{ top: pct(value) }} />
      </div>
    </div>
  )
}
