import { useEffect, useRef } from 'react'
import { audio } from '../engine/audio'
import { removeChannel } from '../engine/devices'
import { store, updateChannel, useStore } from '../store'
import type { AudioChannel } from '../types'
import { Fader } from './Fader'
import { Battery, Icon, LINK_LABEL } from './Icon'

interface MeterState {
  canvas: HTMLCanvasElement
  read: () => number[]
  level: number[]
  peak: number[]
  peakAt: number[]
}

/** One rAF loop draws every meter; React never re-renders for levels. */
const meters = new Map<string, MeterState>()
let meterRaf = 0
function meterLoop() {
  const now = performance.now()
  for (const m of meters.values()) {
    const vals = m.read()
    const ctx = m.canvas.getContext('2d')!
    const W = m.canvas.width
    const H = m.canvas.height
    ctx.clearRect(0, 0, W, H)
    const n = vals.length
    const bw = (W - (n - 1) * 2) / n
    vals.forEach((v, i) => {
      m.level[i] = v > m.level[i] ? v : m.level[i] * 0.9 + v * 0.1
      if (v >= m.peak[i] || now - m.peakAt[i] > 1200) {
        m.peak[i] = v
        m.peakAt[i] = now
      }
      const x = i * (bw + 2)
      ctx.fillStyle = 'rgba(255,255,255,.06)'
      ctx.fillRect(x, 0, bw, H)
      const segs = 30
      const sh = H / segs
      const lit = Math.round(m.level[i] * segs)
      for (let s = 0; s < lit; s++) {
        const f = s / segs
        ctx.fillStyle = f > 0.9 ? '#ff3b3b' : f > 0.75 ? '#ffc53d' : '#3ddc84'
        ctx.fillRect(x, H - (s + 1) * sh + 1, bw, sh - 1)
      }
      const py = H - Math.round(m.peak[i] * segs) * sh
      if (m.peak[i] > 0.02) {
        ctx.fillStyle = m.peak[i] > 0.9 ? '#ff3b3b' : '#e8e8e8'
        ctx.fillRect(x, py, bw, 2)
      }
    })
  }
  meterRaf = requestAnimationFrame(meterLoop)
}

function useMeter(id: string, read: () => number[]) {
  const ref = useRef<HTMLCanvasElement>(null)
  const readRef = useRef(read)
  readRef.current = read
  useEffect(() => {
    const c = ref.current!
    const n = readRef.current().length
    meters.set(id, { canvas: c, read: () => readRef.current(), level: Array(n).fill(0), peak: Array(n).fill(0), peakAt: Array(n).fill(0) })
    if (!meterRaf) meterRaf = requestAnimationFrame(meterLoop)
    return () => {
      meters.delete(id)
      if (!meters.size) {
        cancelAnimationFrame(meterRaf)
        meterRaf = 0
      }
    }
  }, [id])
  return ref
}

function db(g: number) {
  if (g <= 0.001) return '−∞'
  const v = 20 * Math.log10(g * g)
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`
}

function Strip({ ch }: { ch: AudioChannel }) {
  const sources = useStore((s) => s.sources)
  const anySolo = useStore((s) => s.channels.some((c) => c.solo))
  const afvOpen = useStore((s) => !ch.afv || s.program === ch.afv)
  const meter = useMeter(ch.id, () => [audio.level(ch.id)])
  const dim = ch.muted || (anySolo && !ch.solo) || !afvOpen

  return (
    <div className={`strip ${dim ? 'is-dim' : ''} ${ch.status === 'lost' ? 'is-down' : ''}`}>
      <div className="strip-head">
        <input className="strip-name" value={ch.name} onChange={(e) => updateChannel(ch.id, { name: e.target.value })} aria-label="Channel name" />
        <span className="strip-meta" title={ch.detail}>
          <Icon name={ch.link} size={11} /> {LINK_LABEL[ch.link]}
          {ch.battery !== undefined && <Battery level={ch.battery} />}
        </span>
      </div>
      <div className="strip-body">
        <canvas ref={meter} width={10} height={150} className="meter" aria-hidden />
        <Fader value={ch.gain} max={1.5} unity={1} onChange={(gain) => updateChannel(ch.id, { gain })} label={`${ch.name} level`} valueText={`${db(ch.gain)} dB`} />
      </div>
      <output className="strip-db">{db(ch.gain)} dB</output>
      <input
        className="pan"
        type="range"
        min={-1}
        max={1}
        step={0.05}
        value={ch.pan}
        onChange={(e) => updateChannel(ch.id, { pan: Number(e.target.value) })}
        onDoubleClick={() => updateChannel(ch.id, { pan: 0 })}
        aria-label={`${ch.name} pan`}
        title={`Pan ${ch.pan === 0 ? 'C' : ch.pan < 0 ? `L${Math.round(-ch.pan * 100)}` : `R${Math.round(ch.pan * 100)}`}`}
      />
      <div className="strip-btns">
        <button className={`mb mb-mute ${ch.muted ? 'is-on' : ''}`} onClick={() => updateChannel(ch.id, { muted: !ch.muted })} aria-pressed={ch.muted} title="Mute">
          M
        </button>
        <button className={`mb mb-solo ${ch.solo ? 'is-on' : ''}`} onClick={() => updateChannel(ch.id, { solo: !ch.solo })} aria-pressed={ch.solo} title="Solo">
          S
        </button>
      </div>
      <label className="afv" title="Audio follows video: this mic only opens while the chosen camera is on air">
        <span>AFV</span>
        <select value={ch.afv ?? ''} onChange={(e) => updateChannel(ch.id, { afv: e.target.value || null })}>
          <option value="">Off</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {ch.kind !== 'demo' && (
        <button className="strip-remove" onClick={() => removeChannel(ch.id)} aria-label={`Remove ${ch.name}`}>
          <Icon name="close" size={11} />
        </button>
      )}
    </div>
  )
}

function MasterStrip() {
  const master = useStore((s) => s.master)
  const listen = useStore((s) => s.listen)
  const meter = useMeter('master', () => audio.masterLevels())
  return (
    <div className="strip strip-master">
      <div className="strip-head">
        <span className="strip-name">Program</span>
        <span className="strip-meta">Master · L/R</span>
      </div>
      <div className="strip-body">
        <canvas ref={meter} width={22} height={150} className="meter" aria-hidden />
        <Fader value={master} max={1.2} unity={1} onChange={(v) => store.set({ master: v })} label="Master level" valueText={`${db(master)} dB`} />
      </div>
      <output className="strip-db">{db(master)} dB</output>
      <button
        className={`mb mb-listen ${listen ? 'is-on' : ''}`}
        onClick={() => {
          audio.ensure()
          store.set({ listen: !listen })
        }}
        aria-pressed={listen}
      >
        <Icon name="headphones" size={13} /> {listen ? 'On' : 'Listen'}
      </button>
    </div>
  )
}

export function Mixer() {
  const channels = useStore((s) => s.channels)
  return (
    <section className="mixer" aria-label="Audio mixer">
      <div className="mixer-strips">
        {channels.map((c) => (
          <Strip key={c.id} ch={c} />
        ))}
        <button
          className="strip strip-add"
          onClick={() => store.set({ addOpen: true, addTab: 'usb' })}
        >
          <Icon name="mic" size={20} />
          Add mic
        </button>
      </div>
      <MasterStrip />
    </section>
  )
}
