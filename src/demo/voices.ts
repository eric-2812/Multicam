import type { Voice } from '../types'

/**
 * Synthetic audio for demo microphones. Two "people" hold a conversation (formant-filtered
 * buzz, so it reads as speech without words), plus a music bed, room tone and an audience.
 * `talk` exposes the live envelopes so the demo cameras can animate mouths and applause.
 */
export const talk = { host: 0, guest: 0, crowd: 0, applause: 0, beat: 0 }

interface VoiceHandle {
  stop(): void
}

let noiseBuf: AudioBuffer | null = null
function noise(ctx: AudioContext) {
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const n = ctx.createBufferSource()
  n.buffer = noiseBuf
  n.loop = true
  return n
}

const VOWELS: [number, number, number][] = [
  [730, 1090, 2440],
  [530, 1840, 2480],
  [270, 2290, 3010],
  [570, 840, 2410],
  [300, 870, 2240],
  [660, 1720, 2410],
]

/** Who holds the floor. Shared by host and guest so they take turns. */
const director = {
  speaker: 'host' as 'host' | 'guest',
  until: 0,
  tick(now: number) {
    if (now > this.until) {
      this.speaker = this.speaker === 'host' ? 'guest' : 'host'
      this.until = now + 2.5 + Math.random() * 5
    }
  },
}

function speech(ctx: AudioContext, out: AudioNode, who: 'host' | 'guest'): VoiceHandle {
  const f0 = who === 'host' ? 112 : 196
  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.value = f0
  const hiss = noise(ctx)
  const hissGain = ctx.createGain()
  hissGain.gain.value = 0.06
  const pre = ctx.createGain()
  pre.gain.value = 0.5
  osc.connect(pre)
  hiss.connect(hissGain).connect(pre)

  const env = ctx.createGain()
  env.gain.value = 0
  const formants = VOWELS[0].map((f, i) => {
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = f
    bp.Q.value = 9
    const g = ctx.createGain()
    g.gain.value = [1, 0.55, 0.25][i]
    pre.connect(bp).connect(g).connect(env)
    return bp
  })
  const shelf = ctx.createBiquadFilter()
  shelf.type = 'highpass'
  shelf.frequency.value = 90
  const level = ctx.createGain()
  level.gain.value = 1.6
  env.connect(shelf).connect(level).connect(out)
  osc.start()
  hiss.start()

  let next = 0
  let amp = 0
  let ampUntil = 0
  const timer = window.setInterval(() => {
    const now = ctx.currentTime
    director.tick(now)
    const speaking = director.speaker === who
    if (now >= next) {
      if (speaking && Math.random() > 0.08) {
        const dur = 0.08 + Math.random() * 0.2
        const peak = 0.35 + Math.random() * 0.55
        const v = VOWELS[(Math.random() * VOWELS.length) | 0]
        formants.forEach((bp, i) => bp.frequency.setTargetAtTime(v[i] * (who === 'guest' ? 1.12 : 1), now, 0.03))
        osc.frequency.setTargetAtTime(f0 * (0.85 + Math.random() * 0.35), now, 0.05)
        env.gain.cancelScheduledValues(now)
        env.gain.setTargetAtTime(peak, now, 0.015)
        env.gain.setTargetAtTime(0, now + dur, 0.03)
        amp = peak
        ampUntil = now + dur
        next = now + dur + 0.04 + (Math.random() < 0.18 ? 0.25 : Math.random() * 0.06)
      } else {
        next = now + 0.12
      }
    }
    talk[who] = now < ampUntil ? amp : Math.max(0, talk[who] * 0.6)
  }, 30)

  return {
    stop() {
      clearInterval(timer)
      osc.stop()
      hiss.stop()
      env.disconnect()
      talk[who] = 0
    },
  }
}

function music(ctx: AudioContext, out: AudioNode): VoiceHandle {
  const chords = [
    [220, 261.6, 329.6],
    [174.6, 220, 261.6],
    [261.6, 329.6, 392],
    [196, 246.9, 293.7],
  ]
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 1400
  const bus = ctx.createGain()
  bus.gain.value = 0.11
  lp.connect(bus).connect(out)
  const oscs = chords[0].map((f) => {
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.value = f
    const g = ctx.createGain()
    g.gain.value = 0.3
    o.connect(g).connect(lp)
    o.start()
    return o
  })
  const pluckBus = ctx.createGain()
  pluckBus.gain.value = 0.5
  pluckBus.connect(lp)
  let step = 0
  let bar = 0
  const timer = window.setInterval(() => {
    const now = ctx.currentTime
    if (step % 16 === 0) {
      const c = chords[bar++ % chords.length]
      oscs.forEach((o, i) => o.frequency.setTargetAtTime(c[i], now, 0.2))
    }
    const c = chords[(bar - 1 + chords.length) % chords.length]
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = c[step % 3] * 2
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(0.5, now + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35)
    o.connect(g).connect(pluckBus)
    o.start(now)
    o.stop(now + 0.4)
    talk.beat = 1
    step++
  }, 250)
  const decay = window.setInterval(() => (talk.beat *= 0.7), 40)
  return {
    stop() {
      clearInterval(timer)
      clearInterval(decay)
      oscs.forEach((o) => o.stop())
      bus.disconnect()
    },
  }
}

function room(ctx: AudioContext, out: AudioNode): VoiceHandle {
  const n = noise(ctx)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 380
  const g = ctx.createGain()
  g.gain.value = 0.05
  n.connect(lp).connect(g).connect(out)
  n.start()
  return { stop: () => n.stop() }
}

function crowd(ctx: AudioContext, out: AudioNode): VoiceHandle {
  const n = noise(ctx)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 900
  bp.Q.value = 0.8
  const murmur = ctx.createGain()
  murmur.gain.value = 0.04
  n.connect(bp).connect(murmur).connect(out)

  const n2 = noise(ctx)
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 1800
  const clap = ctx.createGain()
  clap.gain.value = 0
  n2.connect(hp).connect(clap).connect(out)
  n.start()
  n2.start()

  let nextApplause = ctx.currentTime + 8
  let applauseEnd = 0
  const timer = window.setInterval(() => {
    const now = ctx.currentTime
    murmur.gain.setTargetAtTime(0.025 + Math.random() * 0.04, now, 0.15)
    if (now > nextApplause) {
      clap.gain.setTargetAtTime(0.22, now, 0.4)
      clap.gain.setTargetAtTime(0, now + 2.6, 0.6)
      applauseEnd = now + 3.6
      nextApplause = now + 18 + Math.random() * 15
    }
    // Clapping is bursty: flutter the gain while applause runs.
    if (now < applauseEnd) {
      const base = now < applauseEnd - 1 ? 0.22 : 0.08
      clap.gain.setTargetAtTime(base * (0.6 + Math.random() * 0.7), now, 0.02)
    }
    talk.applause = now < applauseEnd ? Math.min(1, (applauseEnd - now) / 1.2) : 0
    talk.crowd = 0.3 + Math.random() * 0.2
  }, 60)
  return {
    stop() {
      clearInterval(timer)
      n.stop()
      n2.stop()
      talk.applause = 0
    },
  }
}

export function createVoice(ctx: AudioContext, voice: Voice, out: AudioNode): VoiceHandle {
  switch (voice) {
    case 'host':
    case 'guest':
      return speech(ctx, out, voice)
    case 'music':
      return music(ctx, out)
    case 'room':
      return room(ctx, out)
    case 'crowd':
      return crowd(ctx, out)
  }
}
