import { useEffect, useRef } from 'react'
import { masterTC, nowMs } from '../engine/timecode'
import { recorder } from '../engine/recorder'
import { store, useStore } from '../store'
import type { AudioChannel, LatencyKind, VideoSource } from '../types'
import { Icon, LinkBadge } from './Icon'

const MAX_DELAY = 600
const KIND: Record<LatencyKind, string> = { measured: 'measured', estimated: 'est.' }

function BigTimecode() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const st = store.get()
      if (ref.current) ref.current.textContent = masterTC(nowMs(), st.fps, st.tcMode, st.recordingSince)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <span ref={ref} className="big-tc" />
}

type Row = { kind: 'cam'; item: VideoSource } | { kind: 'mic'; item: AudioChannel }

/** Delay every path up to the slowest one, so picture and sound arrive together. */
export function autoAlign() {
  const st = store.get()
  const lat = [...st.sources.filter((s) => s.status === 'live'), ...st.channels.filter((c) => c.status === 'live')].map((x) => x.latency ?? 0)
  const target = Math.min(MAX_DELAY, Math.max(0, ...lat))
  const d = (l?: number) => Math.max(0, Math.min(MAX_DELAY, Math.round(target - (l ?? 0))))
  store.set((s) => ({
    sources: s.sources.map((x) => ({ ...x, delay: d(x.latency) })),
    channels: s.channels.map((x) => ({ ...x, delay: d(x.latency) })),
  }))
  return target
}

function setDelay(row: Row, delay: number) {
  if (row.kind === 'cam') store.set((s) => ({ sources: s.sources.map((x) => (x.id === row.item.id ? { ...x, delay } : x)) }))
  else store.set((s) => ({ channels: s.channels.map((x) => (x.id === row.item.id ? { ...x, delay } : x)) }))
}

export function SyncSection() {
  const sources = useStore((s) => s.sources)
  const channels = useStore((s) => s.channels)
  const fps = useStore((s) => s.fps)
  const tcMode = useStore((s) => s.tcMode)
  const burnIn = useStore((s) => s.burnIn)

  const rows: Row[] = [...sources.map((item) => ({ kind: 'cam' as const, item })), ...channels.map((item) => ({ kind: 'mic' as const, item }))]
  const totals = rows.filter((r) => r.item.status === 'live').map((r) => (r.item.latency ?? 0) + r.item.delay)
  const slowest = rows.reduce<Row | null>((a, r) => (!a || (r.item.latency ?? 0) > (a.item.latency ?? 0) ? r : a), null)
  const spread = totals.length ? Math.max(...totals) - Math.min(...totals) : 0
  const aligned = spread <= 25
  const phones = sources.filter((s) => s.clock)

  return (
    <div className="sync">
        <section className="sync-clock">
          <div>
            <span className="sync-label">Master clock {tcMode === 'run' ? '· record run' : '· time of day'}</span>
            <BigTimecode />
          </div>
          <div className="sync-clock-controls">
            <div className="seg" role="radiogroup" aria-label="Frame rate">
              {([25, 30] as const).map((f) => (
                <button key={f} role="radio" aria-checked={fps === f} className={fps === f ? 'is-on' : ''} onClick={() => store.set({ fps: f })}>
                  {f} fps
                </button>
              ))}
            </div>
            <div className="seg" role="radiogroup" aria-label="Timecode mode">
              <button role="radio" aria-checked={tcMode === 'tod'} className={tcMode === 'tod' ? 'is-on' : ''} onClick={() => store.set({ tcMode: 'tod' })}>
                Time of day
              </button>
              <button role="radio" aria-checked={tcMode === 'run'} className={tcMode === 'run' ? 'is-on' : ''} onClick={() => store.set({ tcMode: 'run' })}>
                Rec run
              </button>
            </div>
            <div className="row">
              <button className={`chip ${burnIn ? 'is-on' : ''}`} aria-pressed={burnIn} onClick={() => store.set({ burnIn: !burnIn })}>
                Burn-in on program
              </button>

            </div>
          </div>
          <button className="slate-btn" onClick={() => recorder.slate()} title="Flash + beep on every camera, mic and phone at once (S)">
            <span className="slate-stripes" aria-hidden />
            Slate
          </button>
        </section>

        <section className="sync-align">
          <div className="sync-align-head">
            <div>
              <h3>Latency & lip sync</h3>
              <p className="lead">
                Every path arrives a little late — Bluetooth mics and Wi-Fi cameras the most. Auto-align delays the faster ones to match{' '}
                {slowest ? (
                  <>
                    the slowest (<b>{slowest.item.name}</b>, {slowest.item.latency ?? 0} ms)
                  </>
                ) : (
                  'the slowest'
                )}
                , so picture and sound line up.
              </p>
            </div>
            <span className={`sync-state ${aligned ? 'ok' : 'off'}`}>{aligned ? 'In sync' : `Out by ${spread} ms`}</span>
          </div>
          <div className="row">
            <button className="btn btn-primary" onClick={autoAlign}>
              Auto-align
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => store.set((s) => ({ sources: s.sources.map((x) => ({ ...x, delay: 0 })), channels: s.channels.map((x) => ({ ...x, delay: 0 })) }))}
            >
              Reset delays
            </button>
          </div>

          <div className="sync-table" role="table">
            <div className="sync-tr sync-th" role="row">
              <span role="columnheader">Device</span>
              <span role="columnheader">Arrives</span>
              <span role="columnheader">Added delay</span>
              <span role="columnheader">Total</span>
            </div>
            {rows.map((r) => {
              const total = (r.item.latency ?? 0) + r.item.delay
              const max = totals.length ? Math.max(...totals) : total
              return (
                <div key={r.item.id} className={`sync-tr ${r.item.status !== 'live' ? 'is-down' : ''}`} role="row">
                  <span className="sync-dev" role="cell">
                    <Icon name={r.kind === 'cam' ? 'cam' : 'mic'} size={14} />
                    <b>{r.item.name}</b>
                    <LinkBadge link={r.item.link} />
                  </span>
                  <span role="cell" className="mono">
                    {r.item.latency !== undefined ? `${r.item.latency} ms` : '—'}
                    {r.item.latencyKind && <small> {KIND[r.item.latencyKind]}</small>}
                  </span>
                  <span role="cell" className="sync-delay">
                    <input
                      type="range"
                      min={0}
                      max={MAX_DELAY}
                      step={5}
                      value={r.item.delay}
                      onChange={(e) => setDelay(r, Number(e.target.value))}
                      aria-label={`${r.item.name} delay`}
                    />
                    <input
                      type="number"
                      min={0}
                      max={MAX_DELAY}
                      step={5}
                      value={r.item.delay}
                      onChange={(e) => setDelay(r, Math.max(0, Math.min(MAX_DELAY, Number(e.target.value) || 0)))}
                      aria-label={`${r.item.name} delay in milliseconds`}
                    />
                  </span>
                  <span role="cell" className={`mono ${Math.abs(max - total) <= 25 ? 'ok' : 'off'}`}>
                    {total} ms
                  </span>
                </div>
              )
            })}
            {!rows.length && <p className="note">Add cameras or mics to see their latency.</p>}
          </div>
        </section>

        <section className="sync-phones">
          <h3>Phone clocks</h3>
          {phones.length ? (
            <ul className="dev-list">
              {phones.map((p) => (
                <li key={p.id}>
                  <Icon name="phone" />
                  <span className="dev-name">{p.name}</span>
                  <span className="mono">
                    offset {p.clock!.offset > 0 ? '+' : ''}
                    {p.clock!.offset} ms
                  </span>
                  <span className="status status-live">±{Math.max(1, Math.round(p.clock!.rtt / 2))} ms</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="note">Phones joined over Wi-Fi sync their clocks to this one automatically and show the master timecode on screen.</p>
          )}
          <p className="hint">
            Every file in a take starts on the same frame and carries the start timecode in its name. The take sheet (JSON) lists each device's latency so clean feeds can be slipped into sync in the edit.
          </p>
        </section>
    </div>
  )
}
