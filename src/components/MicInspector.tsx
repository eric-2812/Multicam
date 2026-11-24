import { useEffect, useRef } from 'react'
import { audio } from '../engine/audio'
import { removeChannel } from '../engine/devices'
import { store, toast, updateChannel, useStore } from '../store'
import { DEFAULT_FX, type AudioChannel, type ChannelFx } from '../types'
import { Icon, LINK_LABEL } from './Icon'
import { Row, Section, Seg, Slide, Switch } from './ui'

const db = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`
const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${Math.round(v)} Hz`)

function setFx(ch: AudioChannel, patch: Partial<ChannelFx>) {
  updateChannel(ch.id, { fx: { ...ch.fx, ...patch } })
}

/** Live compressor gain reduction. */
function GainReduction({ id }: { id: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const r = audio.reduction(id)
      if (ref.current) ref.current.textContent = `GR ${r < -0.05 ? r.toFixed(1) : '0.0'} dB`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [id])
  return <span ref={ref} className="sec-meta mono" />
}

export function MicInspector() {
  const channels = useStore((s) => s.channels)
  const ch = useStore((s) => s.channels.find((c) => c.id === s.selectedChannel) ?? s.channels[0])
  const sources = useStore((s) => s.sources)
  const recording = useStore((s) => !!s.recordingSince)
  const recMics = useStore((s) => s.rec.mics)
  if (!ch) {
    return (
      <div className="insp-empty">
        <Icon name="mic" size={22} />
        <p>No microphones yet.</p>
        <button className="btn btn-sm" onClick={() => store.set({ page: 'setup', setupSection: 'devices', addTab: 'usb' })}>
          Add microphone
        </button>
      </div>
    )
  }
  const fx = ch.fx
  return (
    <div className="insp-body">
      <div className="mic-pick">
        <select className="inp" aria-label="Microphone" value={ch.id} onChange={(e) => store.set({ selectedChannel: e.target.value })}>
          {channels.map((c, i) => (
            <option key={c.id} value={c.id}>
              A{i + 1} · {c.name}
            </option>
          ))}
        </select>
      </div>

      <Section id="mic-input" title="Input">
        <Row label="Name" htmlFor="mic-name">
          <input id="mic-name" className="inp" value={ch.name} onChange={(e) => updateChannel(ch.id, { name: e.target.value })} />
        </Row>
        <Row label="Connection">
          <span className="ro">
            {LINK_LABEL[ch.link]} · {ch.detail}
          </span>
        </Row>
        <Slide id="mic-trim" label="Trim" value={fx.trim} min={-20} max={20} step={0.5} format={db} onChange={(v) => setFx(ch, { trim: v })} reset={0} />
        <Row label="Polarity" hint="Flip the waveform — fixes thin sound when two mics pick up the same source">
          <Switch label="Invert polarity" on={fx.phase} onChange={(v) => setFx(ch, { phase: v })} />
        </Row>
        <Row label="Recorded to its own file">
          <span className="ro-wrap">{recMics ? 'Yes — after this processing, before the fader' : 'No — turn on in Setup → Recording'}</span>
        </Row>
      </Section>

      <Section id="mic-eq" title="Low cut & EQ">
        <Row label="Low cut">
          <Switch label="Low cut filter" on={fx.hpf} onChange={(v) => setFx(ch, { hpf: v })} />
        </Row>
        <Slide id="mic-hpf" label="Low cut freq." value={fx.hpfFreq} min={20} max={300} step={5} format={hz} onChange={(v) => setFx(ch, { hpfFreq: v })} reset={80} disabled={!fx.hpf} />
        <Slide id="mic-low" label="Low (200 Hz)" value={fx.eqLow} min={-12} max={12} step={0.5} format={db} onChange={(v) => setFx(ch, { eqLow: v })} reset={0} />
        <Slide id="mic-mid" label="Mid" value={fx.eqMid} min={-12} max={12} step={0.5} format={db} onChange={(v) => setFx(ch, { eqMid: v })} reset={0} />
        <Slide id="mic-midf" label="Mid freq." value={fx.eqMidFreq} min={200} max={8000} step={50} format={hz} onChange={(v) => setFx(ch, { eqMidFreq: v })} reset={1000} />
        <Slide id="mic-high" label="High (6 kHz)" value={fx.eqHigh} min={-12} max={12} step={0.5} format={db} onChange={(v) => setFx(ch, { eqHigh: v })} reset={0} />
      </Section>

      <Section id="mic-dyn" title="Dynamics" aside={fx.comp ? <GainReduction id={ch.id} /> : undefined}>
        <Row label="Compressor">
          <Switch label="Compressor" on={fx.comp} onChange={(v) => setFx(ch, { comp: v })} />
        </Row>
        <Slide id="mic-cth" label="Threshold" value={fx.compThreshold} min={-50} max={0} step={1} format={(v) => `${v} dBFS`} onChange={(v) => setFx(ch, { compThreshold: v })} reset={-18} disabled={!fx.comp} />
        <Slide id="mic-cra" label="Ratio" value={fx.compRatio} min={1} max={20} step={0.5} format={(v) => `${v.toFixed(1)}:1`} onChange={(v) => setFx(ch, { compRatio: v })} reset={3} disabled={!fx.comp} />
        <Row label="Noise gate">
          <Switch label="Noise gate" on={fx.gate} onChange={(v) => setFx(ch, { gate: v })} />
        </Row>
        <Slide id="mic-gth" label="Gate threshold" value={fx.gateThreshold} min={-80} max={-10} step={1} format={(v) => `${v} dBFS`} onChange={(v) => setFx(ch, { gateThreshold: v })} reset={-50} disabled={!fx.gate} />
      </Section>

      <Section id="mic-route" title="Level & routing">
        <Slide id="mic-fader" label="Fader" value={ch.gain} min={0} max={1.5} step={0.01} format={(g) => (g <= 0.001 ? '−∞' : db(20 * Math.log10(g * g)))} onChange={(v) => updateChannel(ch.id, { gain: v })} reset={1} />
        <Slide id="mic-pan" label="Pan" value={ch.pan} min={-1} max={1} step={0.05} format={(p) => (p === 0 ? 'C' : p < 0 ? `L${Math.round(-p * 100)}` : `R${Math.round(p * 100)}`)} onChange={(v) => updateChannel(ch.id, { pan: v })} reset={0} />
        <Row label="Mute / solo">
          <Seg
            label="Mute and solo"
            value={ch.muted ? 'mute' : ch.solo ? 'solo' : 'on'}
            options={[
              { v: 'on', label: 'On' },
              { v: 'mute', label: 'Mute' },
              { v: 'solo', label: 'Solo' },
            ]}
            onChange={(v) => updateChannel(ch.id, { muted: v === 'mute', solo: v === 'solo' })}
          />
        </Row>
        <Row label="Follows camera" htmlFor="mic-afv" hint="Audio-follows-video: the mic only opens while this camera is on program">
          <select id="mic-afv" className="inp" value={ch.afv ?? ''} onChange={(e) => updateChannel(ch.id, { afv: e.target.value || null })}>
            <option value="">Always on</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.number} · {s.name}
              </option>
            ))}
          </select>
        </Row>
        <Slide id="mic-delay" label="Sync delay" value={ch.delay} min={0} max={600} step={5} format={(v) => `${v} ms`} onChange={(v) => updateChannel(ch.id, { delay: v })} reset={0} />
      </Section>

      <div className="insp-foot row">
        <button className="btn btn-sm btn-ghost" onClick={() => updateChannel(ch.id, { fx: { ...DEFAULT_FX } })}>
          Reset processing
        </button>
        <span className="grow" />
        {(
          <button
            className="btn btn-sm btn-danger"
            disabled={recording}
            title={recording ? 'Stop recording before removing a microphone' : undefined}
            onClick={() => {
              removeChannel(ch.id)
              toast(`${ch.name} removed`, 'info')
            }}
          >
            <Icon name="trash" size={13} /> Remove mic
          </button>
        )}
      </div>
    </div>
  )
}
