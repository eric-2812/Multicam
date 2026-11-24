import { createVoice } from '../demo/voices'
import type { State } from '../store'
import type { AudioChannel } from '../types'

interface Strip {
  /** Simulated path latency (demo) + lip-sync compensation. */
  delay: DelayNode
  trim: GainNode
  hpf: BiquadFilterNode
  low: BiquadFilterNode
  mid: BiquadFilterNode
  high: BiquadFilterNode
  comp: DynamicsCompressorNode
  /** Noise gate (driven from `gateMeter`). */
  noiseGate: GainNode
  gateMeter: AnalyserNode
  gateBuf: Float32Array<ArrayBuffer>
  gate: GainNode
  fader: GainNode
  panner: StereoPannerNode
  analyser: AnalyserNode
  buf: Float32Array<ArrayBuffer>
  source?: MediaStreamAudioSourceNode
  stop?: () => void
  tap?: MediaStreamAudioDestinationNode
}

/**
 * Mixer: every channel → AFV gate → fader → pan → master. The master feeds the speakers
 * (only while "Listen" is on, to avoid feedback with live mics) and a MediaStream used by
 * the recorder.
 */
class AudioEngine {
  ctx: AudioContext | null = null
  private master!: GainNode
  private monitor!: GainNode
  private dest!: MediaStreamAudioDestinationNode
  private meterL!: AnalyserNode
  private meterR!: AnalyserNode
  private bufL = new Float32Array(1024)
  private bufR = new Float32Array(1024)
  private strips = new Map<string, Strip>()

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return this.ctx
    }
    const ctx = new AudioContext({ latencyHint: 'interactive' })
    this.ctx = ctx
    this.master = ctx.createGain()
    this.monitor = ctx.createGain()
    this.monitor.gain.value = 0
    this.dest = ctx.createMediaStreamDestination()
    const split = ctx.createChannelSplitter(2)
    this.meterL = ctx.createAnalyser()
    this.meterR = ctx.createAnalyser()
    this.meterL.fftSize = this.meterR.fftSize = 1024
    this.master.connect(this.monitor).connect(ctx.destination)
    this.master.connect(this.dest)
    this.master.connect(split)
    split.connect(this.meterL, 0)
    split.connect(this.meterR, 1)
    return ctx
  }

  get stream() {
    this.ensure()
    return this.dest.stream
  }

  private strip(id: string): Strip {
    const ctx = this.ensure()
    const delay = ctx.createDelay(2)
    const trim = ctx.createGain()
    const hpf = ctx.createBiquadFilter()
    hpf.type = 'highpass'
    hpf.frequency.value = 10
    const low = ctx.createBiquadFilter()
    low.type = 'lowshelf'
    low.frequency.value = 200
    const mid = ctx.createBiquadFilter()
    mid.type = 'peaking'
    mid.Q.value = 1
    const high = ctx.createBiquadFilter()
    high.type = 'highshelf'
    high.frequency.value = 6000
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = 0
    comp.ratio.value = 1
    comp.attack.value = 0.005
    comp.release.value = 0.15
    const noiseGate = ctx.createGain()
    const gateMeter = ctx.createAnalyser()
    gateMeter.fftSize = 512
    const gate = ctx.createGain()
    const fader = ctx.createGain()
    const panner = ctx.createStereoPanner()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    // delay → trim → low-cut → EQ → compressor → noise gate → AFV → fader → pan → master
    delay.connect(trim).connect(hpf).connect(low).connect(mid).connect(high).connect(comp)
    comp.connect(gateMeter)
    comp.connect(noiseGate).connect(gate).connect(fader).connect(panner).connect(this.master)
    fader.connect(analyser)
    const s: Strip = {
      delay,
      trim,
      hpf,
      low,
      mid,
      high,
      comp,
      noiseGate,
      gateMeter,
      gateBuf: new Float32Array(512),
      gate,
      fader,
      panner,
      analyser,
      buf: new Float32Array(1024),
    }
    this.strips.set(id, s)
    return s
  }

  addDemo(ch: AudioChannel) {
    if (this.strips.has(ch.id) || !ch.voice) return
    const s = this.strip(ch.id)
    s.stop = createVoice(this.ctx!, ch.voice, s.delay).stop
  }

  addStream(id: string, stream: MediaStream) {
    if (this.strips.has(id)) this.remove(id)
    const s = this.strip(id)
    s.source = this.ctx!.createMediaStreamSource(stream)
    s.source.connect(s.delay)
  }

  remove(id: string) {
    const s = this.strips.get(id)
    if (!s) return
    s.stop?.()
    s.source?.disconnect()
    s.panner.disconnect()
    this.strips.delete(id)
  }

  /** Push fader / mute / solo / AFV / master values into the graph. */
  sync(st: State) {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    const anySolo = st.channels.some((c) => c.solo)
    for (const ch of st.channels) {
      const s = this.strips.get(ch.id)
      if (!s) continue
      const audible = !ch.muted && (!anySolo || ch.solo)
      s.fader.gain.setTargetAtTime(audible ? ch.gain * ch.gain : 0, now, 0.02)
      s.panner.pan.setTargetAtTime(ch.pan, now, 0.02)
      const d = ((ch.latencyKind === 'simulated' ? (ch.latency ?? 0) : 0) + ch.delay) / 1000
      if (Math.abs(s.delay.delayTime.value - d) > 0.0005) s.delay.delayTime.setTargetAtTime(d, now, 0.03)
      const fx = ch.fx
      const dB = (v: number) => Math.pow(10, v / 20)
      s.trim.gain.setTargetAtTime(dB(fx.trim) * (fx.phase ? -1 : 1), now, 0.02)
      s.hpf.frequency.setTargetAtTime(fx.hpf ? fx.hpfFreq : 10, now, 0.02)
      s.low.gain.setTargetAtTime(fx.eqLow, now, 0.02)
      s.mid.gain.setTargetAtTime(fx.eqMid, now, 0.02)
      s.mid.frequency.setTargetAtTime(fx.eqMidFreq, now, 0.02)
      s.high.gain.setTargetAtTime(fx.eqHigh, now, 0.02)
      s.comp.threshold.setTargetAtTime(fx.comp ? fx.compThreshold : 0, now, 0.02)
      s.comp.ratio.setTargetAtTime(fx.comp ? fx.compRatio : 1, now, 0.02)
      // Noise gate: open above the threshold, close (with a short hold via the time constant) below.
      let gateOpen = true
      if (fx.gate) {
        s.gateMeter.getFloatTimeDomainData(s.gateBuf)
        let sum = 0
        for (let i = 0; i < s.gateBuf.length; i++) sum += s.gateBuf[i] * s.gateBuf[i]
        const level = 20 * Math.log10(Math.sqrt(sum / s.gateBuf.length) + 1e-9)
        gateOpen = level > fx.gateThreshold
      }
      s.noiseGate.gain.setTargetAtTime(gateOpen ? 1 : 0, now, gateOpen ? 0.005 : 0.12)
      const afvOpen = !ch.afv || st.program === ch.afv || (st.transitioning && st.preview === ch.afv)
      s.gate.gain.setTargetAtTime(afvOpen ? 1 : 0, now, afvOpen ? 0.05 : 0.15)
    }
    const fade = st.ftb ? 0 : 1
    this.master.gain.setTargetAtTime(st.master * st.master * fade, now, 0.05)
    this.monitor.gain.setTargetAtTime(st.listen ? 1 : 0, now, 0.03)
  }

  /**
   * A channel's own processed signal (delay, trim, EQ, dynamics — before fader/mute), for recording each mic
   * to its own file — the editor gets clean, separately adjustable tracks.
   */
  channelStream(id: string) {
    const s = this.strips.get(id)
    if (!s || !this.ctx) return null
    s.tap ??= this.ctx.createMediaStreamDestination()
    s.noiseGate.connect(s.tap)
    return s.tap.stream
  }

  /** Compressor gain reduction in dB (≤ 0). */
  reduction(id: string) {
    return this.strips.get(id)?.comp.reduction ?? 0
  }

  /** Sync beep (1 kHz, 1 frame-ish) straight into the program mix, so it lands in every recording. */
  slate() {
    const ctx = this.ensure()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = 1000
    g.gain.value = 0.5
    o.connect(g).connect(this.master)
    o.start()
    o.stop(ctx.currentTime + 0.08)
  }

  private static rms(a: AnalyserNode, buf: Float32Array<ArrayBuffer>) {
    a.getFloatTimeDomainData(buf)
    let sum = 0
    let peak = 0
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i]
      sum += v * v
      const abs = v < 0 ? -v : v
      if (abs > peak) peak = abs
    }
    return { rms: Math.sqrt(sum / buf.length), peak }
  }

  /** Meter level 0..1 on a -60..0 dBFS scale. */
  static toMeter(v: number) {
    if (v <= 0.000001) return 0
    const db = 20 * Math.log10(v)
    return Math.max(0, Math.min(1, (db + 60) / 60))
  }

  level(id: string) {
    const s = this.strips.get(id)
    if (!s) return 0
    const { peak } = AudioEngine.rms(s.analyser, s.buf)
    return AudioEngine.toMeter(peak)
  }

  masterLevels(): [number, number] {
    if (!this.ctx) return [0, 0]
    return [
      AudioEngine.toMeter(AudioEngine.rms(this.meterL, this.bufL).peak),
      AudioEngine.toMeter(AudioEngine.rms(this.meterR, this.bufR).peak),
    ]
  }
}

export const audio = new AudioEngine()
