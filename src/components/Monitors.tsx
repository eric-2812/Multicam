import { useEffect, useRef, useState } from 'react'
import { PGM_H, PGM_W, video } from '../engine/video'
import { store, useStore } from '../store'
import type { TransitionType } from '../types'

function Monitor({ which }: { which: 'program' | 'preview' }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const id = useStore((s) => s[which])
  const name = useStore((s) => s.sources.find((x) => x.id === id)?.name ?? '—')
  useEffect(() => {
    video.setMonitor(which, ref.current)
    return () => video.setMonitor(which, null)
  }, [which])
  const w = which === 'program' ? PGM_W : 640
  const h = which === 'program' ? PGM_H : 360
  return (
    <figure className={`monitor monitor-${which}`}>
      <canvas ref={ref} width={w} height={h} />
      <figcaption>
        <span className="monitor-tag">{which === 'program' ? 'PGM' : 'PVW'}</span>
        <span className="monitor-name">{name}</span>
      </figcaption>
    </figure>
  )
}

const TYPES: { id: TransitionType; label: string }[] = [
  { id: 'mix', label: 'Mix' },
  { id: 'dip', label: 'Dip' },
  { id: 'wipe', label: 'Wipe' },
  { id: 'push', label: 'Push' },
]

function TransitionBar() {
  const transition = useStore((s) => s.transition)
  const duration = useStore((s) => s.duration)
  const tbar = useStore((s) => s.tbar)
  const transitioning = useStore((s) => s.transitioning)
  const ftb = useStore((s) => s.ftb)
  const lt = useStore((s) => s.lowerThird)
  const [editLt, setEditLt] = useState(false)

  return (
    <div className="tbar">
      <div className="tbar-group">
        <button className="key key-cut" onClick={() => video.cut()} title="Cut (Space)">
          CUT
        </button>
        <button className={`key key-auto ${transitioning ? 'is-on' : ''}`} onClick={() => video.auto()} title="Auto transition (Enter)">
          AUTO
        </button>
      </div>

      <div className="tbar-group seg" role="radiogroup" aria-label="Transition">
        {TYPES.map((t) => (
          <button key={t.id} role="radio" aria-checked={transition === t.id} className={transition === t.id ? 'is-on' : ''} onClick={() => store.set({ transition: t.id })}>
            {t.label}
          </button>
        ))}
      </div>

      <label className="tbar-group rate">
        <span>Rate</span>
        <select value={duration} onChange={(e) => store.set({ duration: Number(e.target.value) })}>
          {[300, 500, 800, 1200, 2000].map((d) => (
            <option key={d} value={d}>
              {(d / 1000).toFixed(1)}s
            </option>
          ))}
        </select>
      </label>

      <label className="tbar-slider">
        <span className="sr">T-bar</span>
        <input type="range" min={0} max={1} step={0.001} value={tbar} onChange={(e) => video.setTbar(Number(e.target.value))} aria-label="T-bar" />
      </label>

      <div className="tbar-group">
        <div className="lt-wrap">
          <button className={`key key-small ${lt.on ? 'is-live' : ''}`} onClick={() => store.set({ lowerThird: { ...lt, on: !lt.on } })} title="Lower third on/off (L)">
            Lower third
          </button>
          <button className="key key-small key-edit" onClick={() => setEditLt((v) => !v)} aria-expanded={editLt} title="Edit lower third text">
            ✎
          </button>
          {editLt && (
            <div className="popover">
              <label>
                Name
                <input value={lt.title} onChange={(e) => store.set({ lowerThird: { ...lt, title: e.target.value } })} />
              </label>
              <label>
                Title
                <input value={lt.subtitle} onChange={(e) => store.set({ lowerThird: { ...lt, subtitle: e.target.value } })} />
              </label>
              <button className="btn btn-ghost" onClick={() => setEditLt(false)}>
                Done
              </button>
            </div>
          )}
        </div>
        <button className={`key key-small key-ftb ${ftb ? 'is-live' : ''}`} onClick={() => store.set({ ftb: !ftb })} title="Fade to black (F)">
          FTB
        </button>
      </div>
    </div>
  )
}

export function Monitors() {
  return (
    <section className="monitors" aria-label="Preview and program">
      <div className="monitor-row">
        <Monitor which="preview" />
        <Monitor which="program" />
      </div>
      <TransitionBar />
    </section>
  )
}
