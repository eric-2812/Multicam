import { createVoice } from '../demo/voices'
import type { State } from '../store'
import type { AudioChannel } from '../types'

interface Strip {
  gate: GainNode
  fader: GainNode
  panner: StereoPannerNode
  analyser: AnalyserNode
  buf: Float32Array<ArrayBuffer>
  source?: MediaStreamAudioSourceNode
  stop?: () => void
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
    const gate = ctx.createGain()
    const fader = ctx.createGain()
    const panner = ctx.createStereoPanner()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    gate.connect(fader).connect(panner).connect(this.master)
    fader.connect(analyser)
    const s: Strip = { gate, fader, panner, analyser, buf: new Float32Array(1024) }
    this.strips.set(id, s)
    return s
  }

  addDemo(ch: AudioChannel) {
    if (this.strips.has(ch.id) || !ch.voice) return
    const s = this.strip(ch.id)
    s.stop = createVoice(this.ctx!, ch.voice, s.gate).stop
  }

  addStream(id: string, stream: MediaStream) {
    if (this.strips.has(id)) this.remove(id)
    const s = this.strip(id)
    s.source = this.ctx!.createMediaStreamSource(stream)
    s.source.connect(s.gate)
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
      const afvOpen = !ch.afv || st.program === ch.afv || (st.transitioning && st.preview === ch.afv)
      s.gate.gain.setTargetAtTime(afvOpen ? 1 : 0, now, afvOpen ? 0.05 : 0.15)
    }
    const fade = st.ftb ? 0 : 1
    this.master.gain.setTargetAtTime(st.master * st.master * fade, now, 0.05)
    this.monitor.gain.setTargetAtTime(st.listen ? 1 : 0, now, 0.03)
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
