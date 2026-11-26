import { useEffect, useRef, useState } from 'react'
import { joinRoom, type Sender } from '../engine/phone'
import type { Tally } from '../engine/video'
import { capsOf } from '../engine/devices'
import { nowMs, todTC } from '../engine/timecode'
import { Icon } from './Icon'

type Facing = 'environment' | 'user'

async function openCamera(facing: Facing, withAudio: boolean) {
  return navigator.mediaDevices.getUserMedia({
    // pan/tilt/zoom: true asks for PTZ access so the phone reports those controls too.
    video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 }, pan: true, tilt: true, zoom: true } as MediaTrackConstraints,
    audio: withAudio ? { echoCancellation: false, noiseSuppression: true, autoGainControl: true } : false,
  })
}

/** The control room's clock, as this phone sees it after sync — big enough to film as a slate. */
function SyncedTimecode({ offset, rtt }: { offset: number | null; rtt: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      if (ref.current) ref.current.textContent = todTC(nowMs() + (offset ?? 0), 30)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [offset])
  return (
    <div className="phone-tc">
      <span ref={ref} />
      <small>{offset === null ? 'syncing clock…' : `synced ±${Math.max(1, Math.round(rtt / 2))} ms`}</small>
    </div>
  )
}

function beep() {
  try {
    const ctx = new AudioContext()
    const o = ctx.createOscillator()
    o.frequency.value = 1000
    o.connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.08)
    setTimeout(() => void ctx.close(), 300)
  } catch {
    // no audio output available
  }
}

const STATE_TEXT: Record<string, string> = {
  connecting: 'Connecting to the control room…',
  live: 'Connected',
  waiting: 'Waiting for the computer to allow this phone — tap Allow on the Cortiva screen.',
  denied: 'The computer turned this phone away. Stop and ask the operator to allow it, then try again.',
  lost: 'Connection lost — retrying…',
  'no-room': 'Control room not found. Is the “Phone over Wi-Fi” window open on the computer? Retrying…',
}

export function PhoneSender({ room }: { room: string }) {
  const [name, setName] = useState(() => localStorage.getItem('cortiva-phone-name') || `Phone ${Math.floor(Math.random() * 90 + 10)}`)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [facing, setFacing] = useState<Facing>('environment')
  const [mic, setMic] = useState(true)
  const [state, setState] = useState<string>('idle')
  const [tally, setTally] = useState<Tally>('none')
  const [error, setError] = useState<string | null>(null)
  const [clock, setClock] = useState<{ offset: number | null; rtt: number }>({ offset: null, rtt: 0 })
  const [flash, setFlash] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const sender = useRef<Sender | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const facingRef = useRef<Facing>(facing)

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream
  }, [stream])

  // Keep the screen awake while streaming.
  useEffect(() => {
    if (state === 'idle') return
    let lock: { release(): Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> } }
    const get = () => nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {})
    void get()
    const onVis = () => document.visibilityState === 'visible' && get()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      void lock?.release()
    }
  }, [state])

  useEffect(() => () => sender.current?.close(), [])

  const flip = async () => {
    const next: Facing = facingRef.current === 'environment' ? 'user' : 'environment'
    try {
      streamRef.current?.getVideoTracks().forEach((t) => t.stop())
      const s = await openCamera(next, false)
      const old = streamRef.current
      const merged = new MediaStream([...s.getVideoTracks(), ...(old?.getAudioTracks() ?? [])])
      streamRef.current = merged
      facingRef.current = next
      setFacing(next)
      setStream(merged)
      sender.current?.replaceStream(merged)
      sender.current?.sendCaps(capsOf(merged.getVideoTracks()[0]), next)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const flipRef = useRef(flip)
  flipRef.current = flip

  const goLive = async () => {
    setError(null)
    try {
      localStorage.setItem('cortiva-phone-name', name)
      const s = await openCamera(facing, mic)
      streamRef.current = s
      setStream(s)
      sender.current = joinRoom(room, name, s, capsOf(s.getVideoTracks()[0]), facing, {
        tally: setTally,
        state: setState,
        flip: () => void flipRef.current(),
        clock: (offset, rtt) => setClock({ offset, rtt }),
        rec: (m) => (m.on ? startLocalRef.current(m.take ?? 'Take', m.number ?? 0) : stopLocalRef.current()),
        slate: () => {
          setFlash(true)
          beep()
          setTimeout(() => setFlash(false), 120)
        },
        hw: (m) => {
          const t = streamRef.current?.getVideoTracks()[0]
          if (!t) return
          // Apply, then report back what the camera actually did.
          t.applyConstraints({ advanced: [m.c as MediaTrackConstraintSet] })
            .catch(() => {})
            .then(() => sender.current?.sendCaps(capsOf(t), facingRef.current))
        },
      })
    } catch (e) {
      const err = e as DOMException
      setError(err.name === 'NotAllowedError' ? 'Camera permission was denied. Allow it in the browser settings and try again.' : err.message)
    }
  }

  // Local full-quality recording, started and stopped by the control room.
  const localRec = useRef<{ rec: MediaRecorder; chunks: Blob[]; name: string } | null>(null)
  const [recording, setRecording] = useState(false)
  const startLocal = (take: string, num: number) => {
    const s = streamRef.current
    if (!s || localRec.current) return
    const mime = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
    const rec = new MediaRecorder(s, { mimeType: mime, videoBitsPerSecond: 20_000_000 })
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    const tc = todTC(nowMs() + (clockRef.current ?? 0), 30).replace(/:/g, '')
    const name = `${take}_C${num}_${name_.current.replace(/[^\w-]+/g, '_')}_PHONE_${tc}.${mime.includes('mp4') ? 'mp4' : 'webm'}`
    rec.onstop = () => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || 'video/webm' }))
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
    }
    rec.start(1000)
    localRec.current = { rec, chunks, name }
    setRecording(true)
  }
  const stopLocal = () => {
    localRec.current?.rec.stop()
    localRec.current = null
    setRecording(false)
  }
  const startLocalRef = useRef(startLocal)
  startLocalRef.current = startLocal
  const stopLocalRef = useRef(stopLocal)
  stopLocalRef.current = stopLocal
  const clockRef = useRef<number | null>(null)
  clockRef.current = clock.offset
  const name_ = useRef(name)
  name_.current = name

  const stop = () => {
    stopLocal()
    sender.current?.close()
    sender.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    setStream(null)
    setState('idle')
    setTally('none')
  }

  if (state === 'idle') {
    return (
      <main className="phone phone-setup">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="brand-name">Cortiva</span>
        </div>
        <h1>Use this phone as a camera</h1>
        <p>
          Joining control room <b>{room}</b>. Your camera and microphone go straight to the computer over Wi-Fi.
        </p>
        <label className="field">
          Camera name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} />
        </label>
        <div className="seg">
          <button className={facing === 'environment' ? 'is-on' : ''} onClick={() => setFacing('environment')}>
            Rear camera
          </button>
          <button className={facing === 'user' ? 'is-on' : ''} onClick={() => setFacing('user')}>
            Front camera
          </button>
        </div>
        <label className="check">
          <input type="checkbox" checked={mic} onChange={(e) => setMic(e.target.checked)} /> Send microphone too
        </label>
        <button className="btn btn-primary btn-big" onClick={goLive}>
          Go live
        </button>
        {error && <p className="note bad">{error}</p>}
        <p className="note">Tip: turn on Do Not Disturb and keep the phone plugged in for long shoots.</p>
      </main>
    )
  }

  return (
    <main className={`phone phone-live tally-${tally}`}>
      <video ref={videoRef} autoPlay playsInline muted className={facing === 'user' ? 'mirror' : ''} />
      <div className="phone-hud">
        <span className={`phone-tally ${tally}`}>{tally === 'program' ? 'ON AIR' : tally === 'preview' ? 'PREVIEW' : 'STANDBY'}</span>
        {recording && <span className="phone-rec">● REC on phone</span>}
        <span className="phone-state">{state.startsWith('error:') ? state.slice(6) : (STATE_TEXT[state] ?? state)}</span>
      </div>
      <SyncedTimecode offset={clock.offset} rtt={clock.rtt} />
      {flash && <div className="phone-flash" />}
      <div className="phone-controls">
        <button className="round" onClick={flip} aria-label="Switch camera">
          <Icon name="flip" size={22} />
        </button>
        <button className="round round-stop" onClick={stop} aria-label="Stop">
          <Icon name="power" size={22} />
        </button>
      </div>
      {error && <p className="note bad phone-err">{error}</p>}
    </main>
  )
}
