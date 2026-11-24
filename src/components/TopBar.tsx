import { useEffect, useRef, useState } from 'react'
import { loadDemo, unloadDemo } from '../demo/demo'
import { audio } from '../engine/audio'
import { masterTC, nowMs } from '../engine/timecode'
import { video } from '../engine/video'
import { store, useStore } from '../store'
import { Icon } from './Icon'

function Timecode() {
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
  return (
    <button className="timecode" onClick={() => store.set({ syncOpen: true })} title="Master timecode — open Sync & timecode">
      <span ref={ref} />
    </button>
  )
}

function Elapsed({ since }: { since: number }) {
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 500)
    return () => clearInterval(t)
  }, [])
  const s = Math.floor((Date.now() - since) / 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return <>{`${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`}</>
}

export function TopBar({ onHelp }: { onHelp: () => void }) {
  const demo = useStore((s) => s.demo)
  const rec = useStore((s) => s.recordingSince)
  const listen = useStore((s) => s.listen)
  const count = useStore((s) => s.sources.length)
  const mics = useStore((s) => s.channels.length)
  const aligned = useStore((s) => {
    const t = [...s.sources, ...s.channels].filter((x) => x.status === 'live').map((x) => (x.latency ?? 0) + x.delay)
    return !t.length || Math.max(...t) - Math.min(...t) <= 25
  })

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="brand-name">Tally</span>
        <span className="brand-sub">multicam control</span>
      </div>

      <div className="topbar-mid">
        {demo ? (
          <button className="pill pill-demo" onClick={unloadDemo} title="Remove the simulated devices">
            <span className="dot" /> DEMO MODE <span className="pill-action">Exit</span>
          </button>
        ) : (
          <button className="pill" onClick={loadDemo} title="Load six simulated cameras and five mics">
            Load demo devices
          </button>
        )}
        <span className="stat">
          <Icon name="cam" size={14} /> {count}
        </span>
        <span className="stat">
          <Icon name="mic" size={14} /> {mics}
        </span>
        <Timecode />
      </div>

      <div className="topbar-actions">
        <button
          className={`btn btn-ghost ${listen ? 'is-on' : ''}`}
          onClick={() => {
            audio.ensure()
            store.set({ listen: !listen })
          }}
          title="Hear the program mix on this computer (use headphones with live mics)"
          aria-pressed={listen}
        >
          <Icon name="headphones" /> <span className="hide-sm">{listen ? 'Listening' : 'Listen'}</span>
        </button>
        <button className="btn btn-ghost" onClick={() => store.set({ syncOpen: true })} title="Timecode, latency and lip sync">
          <span className={`sync-dot ${aligned ? 'ok' : 'off'}`} /> <span className="hide-sm">Sync</span>
        </button>
        <button className="btn btn-ghost" onClick={() => video.snapshot()} title="Save a still of the program output">
          <Icon name="camera" /> <span className="hide-sm">Still</span>
        </button>
        <button
          className={`btn btn-rec ${rec ? 'is-on' : ''}`}
          onClick={() => (rec ? video.stopRecording() : video.startRecording())}
          title="Record program video + mix (R)"
          aria-pressed={!!rec}
        >
          <span className="rec-dot" />
          {rec ? <Elapsed since={rec} /> : 'REC'}
        </button>
        <button className="btn btn-primary" onClick={() => store.set({ addOpen: true })}>
          <Icon name="plus" /> <span className="hide-sm">Add device</span>
        </button>
        <button className="btn btn-ghost btn-icon" onClick={onHelp} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">
          <Icon name="keyboard" />
        </button>
      </div>
    </header>
  )
}
