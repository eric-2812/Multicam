import Peer, { type DataConnection, type MediaConnection, type PeerOptions } from 'peerjs'
import { addChannel, addSource, store, toast, updateSource } from '../store'
import type { HwCaps } from '../types'
import { audio } from './audio'
import { newChannel, newSource } from './devices'
import { video, type Tally } from './video'

/**
 * Phones join over Wi-Fi with WebRTC. Signalling (just the handshake) goes through the public
 * PeerJS broker; the video itself flows peer-to-peer on the local network.
 * `?signal=host:port` points both sides at a self-hosted PeerJS server instead.
 */
function peerOptions(): PeerOptions {
  const opts: PeerOptions = {
    config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] },
  }
  const custom = new URLSearchParams(location.search).get('signal')
  if (custom) {
    const [host, port] = custom.split(':')
    Object.assign(opts, { host, port: Number(port) || 9000, path: '/', secure: location.protocol === 'https:' })
  }
  return opts
}

export type HostMsg = { type: 'tally'; tally: Tally } | { type: 'hw'; c: Record<string, unknown> } | { type: 'flip' }
export type PhoneMsg =
  | { type: 'hello'; name: string; caps: HwCaps; facing: string }
  | { type: 'battery'; level: number; charging: boolean }
  | { type: 'caps'; caps: HwCaps; facing: string }

interface PhoneLink {
  sourceId: string
  channelId?: string
  conn?: DataConnection
  call?: MediaConnection
  statsTimer?: number
}

let peer: Peer | null = null
let roomId: string | null = null
const phones = new Map<string, PhoneLink>()
const listeners = new Set<(s: RoomStatus) => void>()

export type RoomStatus = { state: 'idle' | 'opening' | 'ready' | 'error'; room?: string; error?: string }
let status: RoomStatus = { state: 'idle' }
function setStatus(s: RoomStatus) {
  status = s
  listeners.forEach((l) => l(s))
}
export function onRoomStatus(l: (s: RoomStatus) => void) {
  listeners.add(l)
  l(status)
  return () => {
    listeners.delete(l)
  }
}

function newRoomId() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += abc[(Math.random() * abc.length) | 0]
  return `tally-${s}`
}

export function joinUrl(room: string) {
  const u = new URL(location.href)
  u.search = ''
  u.hash = ''
  u.searchParams.set('join', room.replace(/^tally-/, ''))
  const custom = new URLSearchParams(location.search).get('signal')
  if (custom) u.searchParams.set('signal', custom)
  return u.toString()
}

/** Open (once) the control-room endpoint that phones dial into. */
export function openRoom() {
  if (peer && status.state !== 'error') return
  peer?.destroy()
  roomId = newRoomId()
  setStatus({ state: 'opening' })
  const p = new Peer(roomId, peerOptions())
  peer = p
  p.on('open', (id) => setStatus({ state: 'ready', room: id }))
  p.on('error', (e) => {
    if (status.state !== 'ready') setStatus({ state: 'error', error: e.message })
    else toast(`Phone link: ${e.message}`, 'bad')
  })
  p.on('disconnected', () => {
    // Lost the broker; existing calls keep flowing, but reconnect so new phones can join.
    setTimeout(() => !p.destroyed && p.reconnect(), 1500)
  })
  p.on('connection', (conn) => {
    const link = linkFor(conn.peer, (conn.metadata?.name as string) || 'Phone')
    link.conn = conn
    conn.on('data', (raw) => handlePhoneMsg(link, raw as PhoneMsg))
    conn.on('open', () => conn.send({ type: 'tally', tally: currentTally(link.sourceId) } satisfies HostMsg))
    conn.on('close', () => lost(link))
  })
  p.on('call', (call) => {
    const link = linkFor(call.peer, (call.metadata?.name as string) || 'Phone')
    link.call = call
    call.answer()
    call.on('stream', (stream) => {
      video.attachStream(link.sourceId, stream, {
        onTally: (t) => link.conn?.open && link.conn.send({ type: 'tally', tally: t } satisfies HostMsg),
        // Stopping a remote track would not reach the phone; just hang up.
        cleanup: () => {
          call.close()
          link.conn?.close()
        },
      })
      updateSource(link.sourceId, { status: 'live' })
      if (stream.getAudioTracks().length) {
        if (!link.channelId) {
          const src = store.get().sources.find((s) => s.id === link.sourceId)
          const ch = newChannel({ name: `${src?.name ?? 'Phone'} mic`, kind: 'phone', link: 'wifi', detail: 'Phone microphone', afv: null })
          link.channelId = ch.id
          addChannel(ch)
        }
        audio.addStream(link.channelId, stream)
      }
      watchStats(link, call)
    })
    call.on('close', () => lost(link))
    call.on('error', () => lost(link))
  })
}

function currentTally(sourceId: string): Tally {
  const st = store.get()
  return st.program === sourceId ? 'program' : st.preview === sourceId ? 'preview' : 'none'
}

function linkFor(peerId: string, name: string): PhoneLink {
  let link = phones.get(peerId)
  if (link && store.get().sources.some((s) => s.id === link!.sourceId)) return link
  const src = newSource({ name: name.slice(0, 24), kind: 'phone', link: 'wifi', detail: 'Phone over Wi-Fi', status: 'connecting', signal: 3 })
  addSource(src)
  toast(`${src.name} is joining…`, 'info')
  link = { sourceId: src.id }
  phones.set(peerId, link)
  return link
}

function handlePhoneMsg(link: PhoneLink, msg: PhoneMsg) {
  if (msg.type === 'hello' || msg.type === 'caps') {
    const patch: Parameters<typeof updateSource>[1] = { hw: msg.caps, detail: `Phone · ${msg.facing === 'user' ? 'front' : 'rear'} camera` }
    if (msg.type === 'hello') {
      patch.name = msg.name.slice(0, 24)
      toast(`${msg.name} connected over Wi-Fi`, 'good')
    }
    updateSource(link.sourceId, patch)
  } else if (msg.type === 'battery') {
    updateSource(link.sourceId, { battery: Math.round(msg.level * 100) })
    if (link.channelId) store.set((s) => ({ channels: s.channels.map((c) => (c.id === link.channelId ? { ...c, battery: Math.round(msg.level * 100) } : c)) }))
  }
}

function watchStats(link: PhoneLink, call: MediaConnection) {
  clearInterval(link.statsTimer)
  link.statsTimer = window.setInterval(async () => {
    const pc = call.peerConnection
    if (!pc) return
    const stats = await pc.getStats()
    stats.forEach((r) => {
      if (r.type === 'candidate-pair' && r.nominated && r.currentRoundTripTime !== undefined) {
        const rtt = r.currentRoundTripTime as number
        const signal = rtt < 0.03 ? 4 : rtt < 0.08 ? 3 : rtt < 0.2 ? 2 : 1
        const cur = store.get().sources.find((s) => s.id === link.sourceId)
        if (cur && cur.signal !== signal) updateSource(link.sourceId, { signal })
      }
    })
  }, 2000)
}

function lost(link: PhoneLink) {
  clearInterval(link.statsTimer)
  const src = store.get().sources.find((s) => s.id === link.sourceId)
  if (src && src.status !== 'lost') {
    updateSource(link.sourceId, { status: 'lost', signal: 0 })
    toast(`${src.name} dropped off Wi-Fi`, 'bad')
  }
}

export function sendToPhone(sourceId: string, msg: HostMsg) {
  for (const link of phones.values()) {
    if (link.sourceId === sourceId && link.conn?.open) link.conn.send(msg)
  }
}

// ------------------------------------------------------------ phone side

export interface Sender {
  replaceStream(s: MediaStream): void
  sendCaps(caps: HwCaps, facing: string): void
  close(): void
}

export function joinRoom(
  room: string,
  name: string,
  stream: MediaStream,
  caps: HwCaps,
  facing: string,
  on: { tally(t: Tally): void; hw(m: Extract<HostMsg, { type: 'hw' }>): void; flip(): void; state(s: string): void },
): Sender {
  const p = new Peer(peerOptions())
  let call: MediaConnection | null = null
  let conn: DataConnection | null = null
  let current = stream
  let closed = false
  let battery: { level: number; charging: boolean; addEventListener(t: string, f: () => void): void } | null = null
  const target = room.startsWith('tally-') ? room : `tally-${room}`

  const sendBattery = () => battery && conn?.open && conn.send({ type: 'battery', level: battery.level, charging: battery.charging } satisfies PhoneMsg)

  const dial = () => {
    if (closed) return
    on.state('connecting')
    conn = p.connect(target, { metadata: { name }, reliable: true })
    conn.on('open', () => {
      conn!.send({ type: 'hello', name, caps, facing } satisfies PhoneMsg)
      sendBattery()
      call = p.call(target, current, { metadata: { name } })
      call.on('stream', () => {})
      call.on('close', () => !closed && (on.state('lost'), setTimeout(dial, 2000)))
      on.state('live')
    })
    conn.on('data', (raw) => {
      const m = raw as HostMsg
      if (m.type === 'tally') on.tally(m.tally)
      else if (m.type === 'hw') on.hw(m)
      else if (m.type === 'flip') on.flip()
    })
    conn.on('close', () => !closed && on.state('lost'))
  }

  p.on('open', dial)
  p.on('error', (e) => {
    if (e.type === 'peer-unavailable') {
      on.state('no-room')
      setTimeout(dial, 3000)
    } else on.state(`error:${e.message}`)
  })

  const nav = navigator as Navigator & { getBattery?: () => Promise<NonNullable<typeof battery>> }
  nav.getBattery?.().then((b) => {
    battery = b
    b.addEventListener('levelchange', sendBattery)
    b.addEventListener('chargingchange', sendBattery)
    sendBattery()
  })

  return {
    replaceStream(s) {
      current = s
      const pc = call?.peerConnection
      if (!pc) return
      for (const sender of pc.getSenders()) {
        const kind = sender.track?.kind
        const next = kind === 'audio' ? s.getAudioTracks()[0] : s.getVideoTracks()[0]
        if (next) void sender.replaceTrack(next)
      }
    },
    sendCaps(c, f) {
      if (conn?.open) conn.send({ type: 'caps', caps: c, facing: f } satisfies PhoneMsg)
    },
    close() {
      closed = true
      p.destroy()
    },
  }
}
