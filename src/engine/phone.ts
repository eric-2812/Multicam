import { useSyncExternalStore } from 'react'
import type Peer from 'peerjs'
import type { DataConnection, MediaConnection, PeerOptions } from 'peerjs'
import { addChannel, addSource, store, toast, updateSource } from '../store'
import type { HwCaps, RawCap } from '../types'
import { audio } from './audio'
import { newChannel, newSource } from './devices'
import { nowMs } from './timecode'
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

export type HostMsg =
  | { type: 'tally'; tally: Tally }
  | { type: 'wait' }
  | { type: 'denied' }
  | { type: 'hw'; c: Record<string, unknown> }
  | { type: 'flip' }
  | { type: 'pong'; t0: number; th: number }
  | { type: 'slate' }
  | { type: 'rec'; on: boolean; take?: string; startMs?: number; number?: number }
export type PhoneMsg =
  | { type: 'hello'; name: string; caps: HwCaps; facing: string }
  | { type: 'ping'; t0: number }
  | { type: 'clock'; offset: number; rtt: number }
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

// The phone link library is only downloaded when a phone link is opened, not with the app.
let PeerLib: typeof Peer | null = null
export const loadPeer = () => (PeerLib ? Promise.resolve() : import('peerjs').then((m) => void (PeerLib = m.default)))
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

/**
 * The room code is the only thing that lets a phone in, so it comes from the system's secure
 * random generator and is long enough (10 characters, ~50 bits) that it can't be guessed.
 */
function newRoomId() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  let s = ''
  // 248 is the largest multiple of 31 below 256: rejecting bytes above it keeps every letter equally likely.
  for (let i = 0; s.length < 10; i++) {
    if (i === bytes.length) {
      crypto.getRandomValues(bytes)
      i = 0
    }
    if (bytes[i] < 248) s += abc[bytes[i] % abc.length]
  }
  return `cortiva-${s}`
}

// ------------------------------------------------------------ checking what arrives over Wi-Fi
// Everything a phone (or the control room) sends is untrusted: check its shape before using it.

const MAX_PHONES = 16
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** A name safe to show and to put in file names and edit lists: no control or direction characters. */
export function cleanName(v: unknown, fallback: string, max = 24): string {
  if (typeof v !== 'string') return fallback
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim()
  return s.slice(0, max) || fallback
}

const RANGE_KEYS = ['zoom', 'focus', 'aperture', 'shutter', 'iso', 'wb', 'ev', 'sharpness', 'pan', 'tilt'] as const

/** Keep only well-formed camera capabilities from a phone. */
export function cleanCaps(v: unknown): HwCaps {
  if (!isObj(v)) return {}
  const out: HwCaps = {}
  for (const k of RANGE_KEYS) {
    const r = v[k]
    if (Array.isArray(r) && r.length === 2 && finite(r[0]) && finite(r[1])) out[k] = [r[0], r[1]]
  }
  if (typeof v.torch === 'boolean') out.torch = v.torch
  if (typeof v.nd === 'boolean') out.nd = v.nd
  for (const k of ['width', 'height', 'fps'] as const) if (finite(v[k]) && v[k] > 0 && v[k] < 100000) out[k] = v[k]
  if (Array.isArray(v.modes)) {
    out.modes = v.modes
      .slice(0, 64)
      .filter((m): m is { w: number; h: number; fps: unknown } => isObj(m) && finite(m.w) && finite(m.h))
      .map((m) => ({ w: m.w, h: m.h, fps: Array.isArray(m.fps) ? m.fps.filter(finite).slice(0, 16) : [] }))
  }
  if (isObj(v.raw) && isObj(v.raw.caps) && isObj(v.raw.settings)) {
    const caps: Record<string, RawCap> = {}
    const settings: Record<string, unknown> = {}
    for (const [k, c] of Object.entries(v.raw.caps).slice(0, 64)) {
      if (!/^[A-Za-z]{1,40}$/.test(k)) continue
      if (typeof c === 'boolean') caps[k] = c
      else if (Array.isArray(c)) caps[k] = c.filter((x): x is string | boolean => typeof x === 'boolean' || (typeof x === 'string' && x.length <= 40)).slice(0, 32)
      else if (isObj(c) && finite(c.min) && finite(c.max)) caps[k] = { min: c.min, max: c.max, ...(finite(c.step) ? { step: c.step } : {}) }
    }
    for (const [k, s] of Object.entries(v.raw.settings).slice(0, 64)) {
      if (!/^[A-Za-z]{1,40}$/.test(k)) continue
      if (finite(s) || typeof s === 'boolean' || (typeof s === 'string' && s.length <= 40)) settings[k] = s
    }
    out.raw = { caps, settings }
  }
  return out
}

function parsePhoneMsg(raw: unknown): PhoneMsg | null {
  if (!isObj(raw)) return null
  switch (raw.type) {
    case 'hello':
    case 'caps': {
      const facing = raw.facing === 'user' ? 'user' : 'environment'
      const caps = cleanCaps(raw.caps)
      return raw.type === 'hello' ? { type: 'hello', name: cleanName(raw.name, 'Phone'), caps, facing } : { type: 'caps', caps, facing }
    }
    case 'ping':
      return finite(raw.t0) ? { type: 'ping', t0: raw.t0 } : null
    case 'clock':
      return finite(raw.offset) && finite(raw.rtt) && Math.abs(raw.offset) < 8.64e7 && raw.rtt >= 0 && raw.rtt < 60000
        ? { type: 'clock', offset: raw.offset, rtt: raw.rtt }
        : null
    case 'battery':
      return finite(raw.level) && raw.level >= 0 && raw.level <= 1 ? { type: 'battery', level: raw.level, charging: raw.charging === true } : null
    default:
      return null
  }
}

const TALLIES: readonly Tally[] = ['program', 'preview', 'none']

function parseHostMsg(raw: unknown): HostMsg | null {
  if (!isObj(raw)) return null
  switch (raw.type) {
    case 'tally':
      return TALLIES.includes(raw.tally as Tally) ? { type: 'tally', tally: raw.tally as Tally } : null
    case 'hw': {
      if (!isObj(raw.c)) return null
      // Constraints for this phone's own camera: plain values only.
      const c: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(raw.c).slice(0, 64)) {
        if (/^[A-Za-z]{1,40}$/.test(k) && (finite(v) || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 40))) c[k] = v
      }
      return { type: 'hw', c }
    }
    case 'flip':
    case 'slate':
    case 'wait':
    case 'denied':
      return { type: raw.type }
    case 'pong':
      return finite(raw.t0) && finite(raw.th) ? { type: 'pong', t0: raw.t0, th: raw.th } : null
    case 'rec':
      return {
        type: 'rec',
        on: raw.on === true,
        take: typeof raw.take === 'string' ? raw.take.replace(/[^\w-]+/g, '_').slice(0, 64) : undefined,
        startMs: finite(raw.startMs) ? raw.startMs : undefined,
        number: finite(raw.number) ? Math.max(0, Math.min(999, Math.round(raw.number))) : undefined,
      }
    default:
      return null
  }
}

/**
 * Where phones open the join page. In the browser that's this same site; the desktop app
 * isn't reachable from a phone, so it points phones at the public web version instead.
 */
const PUBLIC_URL = import.meta.env.VITE_PUBLIC_URL || 'https://eric-2812.github.io/cortiva/app/'

export function joinUrl(room: string) {
  const u = new URL(/^https?:$/.test(location.protocol) ? location.href : PUBLIC_URL)
  u.search = ''
  u.hash = ''
  u.searchParams.set('join', room.replace(/^cortiva-/, ''))
  const custom = new URLSearchParams(location.search).get('signal')
  if (custom) u.searchParams.set('signal', custom)
  return u.toString()
}

/** Open (once) the control-room endpoint that phones dial into. */
export function openRoom() {
  if (peer && status.state !== 'error') return
  if (!PeerLib) {
    setStatus({ state: 'opening' })
    loadPeer().then(openRoom, () => setStatus({ state: 'error', error: 'the phone link could not be loaded' }))
    return
  }
  peer?.destroy()
  roomId = newRoomId()
  setStatus({ state: 'opening' })
  const p = new PeerLib(roomId, peerOptions())
  peer = p
  p.on('open', (id) => setStatus({ state: 'ready', room: id }))
  p.on('error', (e) => {
    if (status.state !== 'ready') setStatus({ state: 'error', error: e.message })
    else toast(`Phone link: ${e.message}`, 'bad')
  })
  let retries = 0
  p.on('open', () => (retries = 0))
  p.on('disconnected', () => {
    // Lost the broker. Calls already running keep flowing; reconnect (with back-off) so new
    // phones can join, but give up after a few tries instead of hammering an unreachable broker.
    if (p.destroyed || status.state !== 'ready' || retries >= 5) {
      if (status.state !== 'ready') setStatus({ state: 'error', error: 'the connection service could not be reached' })
      return
    }
    retries++
    setTimeout(() => !p.destroyed && p.reconnect(), 1500 * 2 ** retries)
  })
  // The slate flashes every phone screen too, so phones can act as a visible clapperboard.
  window.addEventListener('cortiva-slate', () => {
    for (const l of phones.values()) if (l.conn?.open) l.conn.send({ type: 'slate' } satisfies HostMsg)
  })
  // Record-all also starts each phone's own full-quality recording.
  window.addEventListener('cortiva-rec', (e) => {
    const d = (e as CustomEvent<{ on: boolean; take?: string; startMs?: number }>).detail
    for (const l of phones.values()) {
      if (!l.conn?.open) continue
      const src = store.get().sources.find((s) => s.id === l.sourceId)
      if (d.on && !src?.rec.armed) continue
      l.conn.send({ type: 'rec', on: d.on, take: d.take, startMs: d.startMs, number: src?.number } satisfies HostMsg)
    }
  })
  // Every new phone waits until someone at the computer allows it (see gate()).
  p.on('connection', (conn) => (approved.has(conn.peer) ? acceptConn(conn) : gate(conn.peer, conn.metadata?.name, { conn })))
  p.on('call', (call) => (approved.has(call.peer) ? acceptCall(call) : gate(call.peer, call.metadata?.name, { call })))
}

function acceptConn(conn: DataConnection, buffered: unknown[] = []) {
  const link = linkFor(conn.peer, conn.metadata?.name)
  if (!link) return conn.close()
  link.conn = conn
  const onData = (raw: unknown) => {
    const msg = parsePhoneMsg(raw)
    if (msg) handlePhoneMsg(link, msg)
  }
  conn.on('data', onData)
  // The first tally tells the phone it's in (older phones go live on it too).
  const welcome = () => conn.send({ type: 'tally', tally: currentTally(link.sourceId) } satisfies HostMsg)
  if (conn.open) welcome()
  else conn.on('open', welcome)
  buffered.forEach(onData)
  conn.on('close', () => lost(link))
}

function acceptCall(call: MediaConnection) {
  const link = linkFor(call.peer, call.metadata?.name)
  if (!link) return call.close()
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
}

// ------------------------------------------------------------ approving phones
// Knowing the room code isn't enough: someone at the computer allows each phone. A phone that was
// allowed (same page on the phone) comes back on its own after a Wi-Fi drop.

export interface JoinRequest {
  peer: string
  name: string
}

interface Pending extends JoinRequest {
  conns: DataConnection[]
  calls: MediaConnection[]
  buffered: unknown[]
  onData: Map<DataConnection, (raw: unknown) => void>
  timer: number
}

const approved = new Set<string>()
const declined = new Set<string>()
const pending = new Map<string, Pending>()
const MAX_PENDING = 4
const ASK_FOR_MS = 90_000

let requests: JoinRequest[] = []
const requestListeners = new Set<() => void>()
function publishRequests() {
  requests = [...pending.values()].map(({ peer, name }) => ({ peer, name }))
  requestListeners.forEach((l) => l())
}

/** Phones waiting to be allowed in, for the prompt on screen. */
export function useJoinRequests() {
  return useSyncExternalStore(
    (l) => {
      requestListeners.add(l)
      return () => requestListeners.delete(l)
    },
    () => requests,
  )
}

function gate(peer: string, rawName: unknown, item: { conn?: DataConnection; call?: MediaConnection }) {
  if (declined.has(peer) || (!pending.has(peer) && pending.size >= MAX_PENDING)) {
    item.conn?.close()
    item.call?.close()
    return
  }
  let req = pending.get(peer)
  if (!req) {
    req = { peer, name: cleanName(rawName, 'Phone'), conns: [], calls: [], buffered: [], onData: new Map(), timer: 0 }
    req.timer = window.setTimeout(() => decline(peer, true), ASK_FOR_MS)
    pending.set(peer, req)
    publishRequests()
  }
  const r = req
  if (item.conn) {
    const conn = item.conn
    r.conns.push(conn)
    // Keep what the phone says while it waits (its name and camera), to use once it's allowed.
    const onData = (raw: unknown) => r.buffered.length < 20 && r.buffered.push(raw)
    r.onData.set(conn, onData)
    conn.on('data', onData)
    const wait = () => conn.send({ type: 'wait' } satisfies HostMsg)
    if (conn.open) wait()
    else conn.on('open', wait)
    conn.on('close', () => {
      // The phone gave up before anyone answered.
      if (pending.get(peer) === r && r.conns.every((c) => !c.open)) {
        clearTimeout(r.timer)
        pending.delete(peer)
        publishRequests()
      }
    })
  }
  if (item.call) r.calls.push(item.call)
}

export function allowPhone(peer: string) {
  const r = pending.get(peer)
  if (!r) return
  clearTimeout(r.timer)
  pending.delete(peer)
  publishRequests()
  approved.add(peer)
  for (const conn of r.conns) {
    const f = r.onData.get(conn)
    if (f) conn.off('data', f)
    acceptConn(conn, r.buffered)
  }
  r.calls.forEach(acceptCall)
}

export function decline(peer: string, timedOut = false) {
  const r = pending.get(peer)
  if (!r) return
  clearTimeout(r.timer)
  pending.delete(peer)
  publishRequests()
  declined.add(peer)
  for (const conn of r.conns) {
    if (conn.open) conn.send({ type: 'denied' } satisfies HostMsg)
    setTimeout(() => conn.close(), 300)
  }
  r.calls.forEach((c) => c.close())
  toast(timedOut ? `${r.name} wasn't allowed in time and was turned away` : `${r.name} turned away`, 'info')
}

function currentTally(sourceId: string): Tally {
  const st = store.get()
  return st.program === sourceId ? 'program' : st.preview === sourceId ? 'preview' : 'none'
}

function linkFor(peerId: string, rawName: unknown): PhoneLink | null {
  let link = phones.get(peerId)
  if (link && store.get().sources.some((s) => s.id === link!.sourceId)) return link
  // Drop links whose camera was removed, then refuse once the room is full.
  for (const [id, l] of phones) if (!store.get().sources.some((s) => s.id === l.sourceId)) phones.delete(id)
  if (phones.size >= MAX_PHONES) {
    toast(`A phone tried to join, but ${MAX_PHONES} phones are already connected`, 'bad')
    return null
  }
  const name = cleanName(rawName, 'Phone')
  const src = newSource({ name, kind: 'phone', link: 'wifi', detail: 'Phone over Wi-Fi', status: 'connecting', signal: 3 })
  addSource(src)
  toast(`${src.name} is joining…`, 'info')
  link = { sourceId: src.id }
  phones.set(peerId, link)
  return link
}

function handlePhoneMsg(link: PhoneLink, msg: PhoneMsg) {
  if (msg.type === 'ping') {
    // NTP-style: the phone works out its offset from our reply.
    link.conn?.send({ type: 'pong', t0: msg.t0, th: nowMs() } satisfies HostMsg)
  } else if (msg.type === 'clock') {
    updateSource(link.sourceId, { clock: { offset: Math.round(msg.offset), rtt: Math.round(msg.rtt) } })
  } else if (msg.type === 'hello' || msg.type === 'caps') {
    const patch: Parameters<typeof updateSource>[1] = { hw: msg.caps, detail: `Phone · ${msg.facing === 'user' ? 'front' : 'rear'} camera` }
    if (msg.type === 'hello') {
      patch.name = msg.name
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
    let rtt = 0
    const jb: Record<string, number> = {}
    stats.forEach((r) => {
      if (r.type === 'candidate-pair' && r.nominated && r.currentRoundTripTime !== undefined) {
        rtt = r.currentRoundTripTime as number
        const signal = rtt < 0.03 ? 4 : rtt < 0.08 ? 3 : rtt < 0.2 ? 2 : 1
        const cur = store.get().sources.find((s) => s.id === link.sourceId)
        if (cur && cur.signal !== signal) updateSource(link.sourceId, { signal })
      }
      if (r.type === 'inbound-rtp' && r.jitterBufferEmittedCount) {
        jb[r.kind as string] = (r.jitterBufferDelay / r.jitterBufferEmittedCount) * 1000
      }
    })
    // Estimate: half the round trip + jitter buffer + capture/encode (~60 ms video, ~30 ms audio).
    const st = store.get()
    const src = st.sources.find((s) => s.id === link.sourceId)
    if (src && src.latencyKind !== 'measured' && jb.video !== undefined) {
      const est = Math.round((rtt * 500 + jb.video + 60) / 5) * 5
      if (Math.abs((src.latency ?? 0) - est) >= 10) updateSource(link.sourceId, { latency: est, latencyKind: 'estimated' })
    }
    const ch = st.channels.find((c) => c.id === link.channelId)
    if (ch && jb.audio !== undefined) {
      const est = Math.round((rtt * 500 + jb.audio + 30) / 5) * 5
      if (Math.abs((ch.latency ?? 0) - est) >= 10) {
        store.set((s) => ({ channels: s.channels.map((c) => (c.id === ch.id ? { ...c, latency: est, latencyKind: 'estimated' } : c)) }))
      }
    }
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
  on: {
    tally(t: Tally): void
    hw(m: Extract<HostMsg, { type: 'hw' }>): void
    flip(): void
    state(s: string): void
    clock(offset: number, rtt: number): void
    slate(): void
    rec(m: Extract<HostMsg, { type: 'rec' }>): void
  },
): Sender {
  if (!PeerLib) throw new Error('Call loadPeer() before joining')
  const p = new PeerLib(peerOptions())
  let call: MediaConnection | null = null
  let conn: DataConnection | null = null
  let current = stream
  let closed = false
  let live = false
  let battery: { level: number; charging: boolean; addEventListener(t: string, f: () => void): void } | null = null
  const target = room.startsWith('cortiva-') ? room : `cortiva-${room}`

  // Clock sync: bursts of pings; the reply with the shortest round trip gives the best offset.
  let best: { offset: number; rtt: number; at: number } | null = null
  let syncTimer = 0
  const syncBurst = () => {
    let n = 0
    const one = () => {
      if (conn?.open) conn.send({ type: 'ping', t0: nowMs() } satisfies PhoneMsg)
      if (++n < 6) setTimeout(one, 120)
    }
    one()
  }
  const onPong = (m: Extract<HostMsg, { type: 'pong' }>) => {
    const t1 = nowMs()
    const rtt = t1 - m.t0
    const offset = m.th - (m.t0 + t1) / 2
    // Prefer the tightest sample, but let old ones age out (clocks drift, Wi-Fi changes).
    if (!best || rtt <= best.rtt || t1 - best.at > 20000) {
      best = { offset, rtt, at: t1 }
      on.clock(offset, rtt)
      if (conn?.open) conn.send({ type: 'clock', offset, rtt } satisfies PhoneMsg)
    }
  }

  const sendBattery = () => battery && conn?.open && conn.send({ type: 'battery', level: battery.level, charging: battery.charging } satisfies PhoneMsg)

  const dial = () => {
    if (closed) return
    on.state('connecting')
    conn = p.connect(target, { metadata: { name }, reliable: true })
    conn.on('open', () => {
      conn!.send({ type: 'hello', name, caps, facing } satisfies PhoneMsg)
      live = false
      sendBattery()
      best = null
      clearInterval(syncTimer)
      syncBurst()
      syncTimer = window.setInterval(syncBurst, 5000)
      call = p.call(target, current, { metadata: { name } })
      call.on('stream', () => {})
      call.on('close', () => !closed && (on.state('lost'), setTimeout(dial, 2000)))
    })
    conn.on('data', (raw) => {
      const m = parseHostMsg(raw)
      if (!m) return
      // The control room's first tally means this phone is in.
      if (m.type === 'tally' && !live) {
        live = true
        on.state('live')
      }
      if (m.type === 'wait') on.state('waiting')
      else if (m.type === 'denied') {
        closed = true
        on.state('denied')
        p.destroy()
      } else if (m.type === 'tally') on.tally(m.tally)
      else if (m.type === 'hw') on.hw(m)
      else if (m.type === 'flip') on.flip()
      else if (m.type === 'pong') onPong(m)
      else if (m.type === 'slate') on.slate()
      else if (m.type === 'rec') on.rec(m)
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
      clearInterval(syncTimer)
      p.destroy()
    },
  }
}
