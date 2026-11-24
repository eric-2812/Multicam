import { useState, type ReactNode } from 'react'
import { Icon } from './Icon'

/** Small persistent UI memory (open sections etc.), safe when storage is blocked. */
function remember<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`cortiva:${key}`)
    return v === null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}
function persist(key: string, v: unknown) {
  try {
    localStorage.setItem(`cortiva:${key}`, JSON.stringify(v))
  } catch {
    // storage unavailable
  }
}

/** Collapsible inspector section. Remembers whether it was open. */
export function Section(props: { id: string; title: string; aside?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(() => remember(`sec:${props.id}`, props.defaultOpen ?? true))
  return (
    <section className={`sec ${open ? 'is-open' : ''}`}>
      <header className="sec-head">
        <button
          className="sec-toggle"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open)
            persist(`sec:${props.id}`, !open)
          }}
        >
          <Icon name="chevron" size={14} className="sec-chev" />
          {props.title}
        </button>
        {props.aside && <div className="sec-aside">{props.aside}</div>}
      </header>
      {open && <div className="sec-body">{props.children}</div>}
    </section>
  )
}

/** Label on the left, control on the right. */
export function Row(props: { label: string; hint?: string; children: ReactNode; htmlFor?: string; tag?: ReactNode }) {
  return (
    <div className="row-f">
      <label className="row-l" htmlFor={props.htmlFor} title={props.hint}>
        {props.label}
        {props.tag}
      </label>
      <div className="row-c">{props.children}</div>
    </div>
  )
}

export function Seg<T extends string | number>(props: { value: T; options: { v: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; label: string; disabled?: boolean }) {
  return (
    <div className="seg" role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={String(o.v)}
          role="radio"
          aria-checked={props.value === o.v}
          className={props.value === o.v ? 'is-on' : ''}
          title={o.title}
          disabled={props.disabled}
          onClick={() => props.onChange(o.v)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Switch(props: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={props.on}
      aria-label={props.label}
      className={`switch ${props.on ? 'is-on' : ''}`}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.on)}
    >
      <span />
    </button>
  )
}

/** Compact slider with value readout. Double-click resets. */
export function Slide(props: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
  reset?: number
  disabled?: boolean
  id?: string
  tag?: ReactNode
}) {
  const id = props.id ?? `sl-${props.label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div className={`slide ${props.disabled ? 'is-disabled' : ''}`}>
      <label htmlFor={id}>
        {props.label}
        {props.tag}
      </label>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(Number(e.target.value))}
        onDoubleClick={() => props.reset !== undefined && props.onChange(props.reset)}
      />
      <output htmlFor={id}>{props.format(props.value)}</output>
    </div>
  )
}

export function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`
}
