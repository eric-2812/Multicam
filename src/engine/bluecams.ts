import { store, toast, uid } from '../store'
import type { RemoteCam } from '../types'

/**
 * On-camera recording over Bluetooth LE, so GoPros and Sony Alphas record full quality to their
 * own cards, started and stopped with Tally's REC.
 *
 * GoPro: the official Open GoPro BLE API (HERO9 and later).
 * Sony: the Bluetooth remote protocol used by Sony's own RMT-P1BT remote, as documented by the
 * community (coral/freemote). The camera needs "Bluetooth Rmt Ctrl" turned on.
 */

// Minimal Web Bluetooth typings (not in TypeScript's DOM lib).
type Char = {
  properties: { write: boolean; writeWithoutResponse: boolean }
  writeValueWithResponse(v: BufferSource): Promise<void>
  writeValueWithoutResponse(v: BufferSource): Promise<void>
  startNotifications(): Promise<Char>
  addEventListener(t: 'characteristicvaluechanged', f: (e: Event) => void): void
  value?: DataView
}
type Service = { getCharacteristic(u: string | number): Promise<Char> }
type Server = { connected: boolean; getPrimaryService(u: string | number): Promise<Service>; disconnect(): void }
type Device = { id: string; name?: string; gatt?: { connect(): Promise<Server> }; addEventListener(t: 'gattserverdisconnected', f: () => void): void }
type Bluetooth = { requestDevice(o: object): Promise<Device> }

export function bleSupported() {
  return 'bluetooth' in navigator
}

function bt() {
  if (!bleSupported()) throw new Error('This browser has no Bluetooth access. Use Chrome or Edge on a computer or Android.')
  return (navigator as unknown as { bluetooth: Bluetooth }).bluetooth
}

function update(id: string, patch: Partial<RemoteCam>) {
  store.set((s) => ({ remotes: s.remotes.map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Link {
  device: Device
  server?: Server
  timers: number[]
  /** GATT allows one operation at a time, so every write goes through this queue. */
  queue: Promise<unknown>
  setRecording(on: boolean): Promise<void>
  photo?(): Promise<void>
  connect(): Promise<void>
}

const links = new Map<string, Link>()

function enqueue(link: Link, op: () => Promise<unknown>) {
  const next = link.queue.then(op, op)
  link.queue = next.catch(() => {})
  return next
}

const valueOf = (e: Event) => (e.target as unknown as Char).value

async function write(c: Char, bytes: number[]) {
  const data = new Uint8Array(bytes)
  if (c.properties.write) await c.writeValueWithResponse(data)
  else await c.writeValueWithoutResponse(data)
}

function track(link: Link, id: string, name: string) {
  link.device.addEventListener('gattserverdisconnected', () => {
    link.timers.forEach(clearInterval)
    link.timers = []
    if (!links.has(id)) return
    update(id, { status: 'lost' })
    toast(`${name} disconnected — it will reconnect when it's back in range`, 'bad')
    void retry(id)
  })
}

async function retry(id: string) {
  for (let i = 0; i < 12; i++) {
    await sleep(5000)
    const link = links.get(id)
    if (!link) return
    try {
      await link.connect()
      return
    } catch {
      // still out of range
    }
  }
}

// ------------------------------------------------------------------ GoPro

const gp = (n: string) => `b5f9${n}-aa8d-11e3-9046-0002a5d5c51b`
const GP_SERVICE = 0xfea6
const STATUS_ENCODING = 10
const STATUS_BATTERY = 70

/** Reassembles GoPro's packetised BLE responses (general, 13-bit and 16-bit length headers). */
function assembler(onMessage: (payload: Uint8Array) => void) {
  let buf: number[] = []
  let need = 0
  return (dv: DataView) => {
    const b = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength)
    if (!b.length) return
    if (b[0] & 0x80) {
      buf.push(...b.slice(1))
    } else {
      const type = (b[0] >> 5) & 0x03
      const start = type === 0 ? 1 : type === 1 ? 2 : 3
      need = type === 0 ? b[0] & 0x1f : type === 1 ? ((b[0] & 0x1f) << 8) | b[1] : (b[1] << 8) | b[2]
      buf = [...b.slice(start)]
    }
    if (need && buf.length >= need) {
      onMessage(Uint8Array.from(buf.slice(0, need)))
      buf = []
      need = 0
    }
  }
}

/** Status query response: query id, result, then (id, length, value…) triples. */
function parseStatus(p: Uint8Array) {
  const out = new Map<number, number[]>()
  if (p.length < 2 || p[1] !== 0) return out
  for (let i = 2; i + 1 < p.length; ) {
    const id = p[i]
    const len = p[i + 1]
    out.set(id, Array.from(p.slice(i + 2, i + 2 + len)))
    i += 2 + len
  }
  return out
}

export async function pairGoPro() {
  const device = await bt().requestDevice({ filters: [{ services: [GP_SERVICE] }], optionalServices: [GP_SERVICE] })
  const id = uid('gopro')
  const name = device.name || 'GoPro'
  store.set((s) => ({ remotes: [...s.remotes, { id, kind: 'gopro', name, status: 'connecting', recording: null, follow: true }] }))

  let cmd: Char
  let settings: Char
  let query: Char
  const link: Link = {
    device,
    timers: [],
    queue: Promise.resolve(),
    async connect() {
      update(id, { status: 'connecting' })
      const server = await device.gatt!.connect()
      link.server = server
      const svc = await server.getPrimaryService(GP_SERVICE)
      cmd = await svc.getCharacteristic(gp('0072'))
      settings = await svc.getCharacteristic(gp('0074'))
      query = await svc.getCharacteristic(gp('0076'))
      // Responses must be subscribed to before the camera answers anything.
      for (const u of ['0073', '0075']) await (await svc.getCharacteristic(gp(u))).startNotifications()
      const qRsp = await svc.getCharacteristic(gp('0077'))
      const onQuery = assembler((p) => {
        if (p[0] !== 0x13 && p[0] !== 0x93) return
        const st = parseStatus(p)
        const patch: Partial<RemoteCam> = {}
        if (st.has(STATUS_ENCODING)) patch.recording = st.get(STATUS_ENCODING)![0] === 1
        if (st.has(STATUS_BATTERY)) patch.battery = st.get(STATUS_BATTERY)![0]
        if (Object.keys(patch).length) update(id, patch)
      })
      qRsp.addEventListener('characteristicvaluechanged', (e) => valueOf(e) && onQuery(valueOf(e)!))
      await qRsp.startNotifications()
      update(id, { status: 'connected' })
      // Keep-alive (setting 91 = 0x42) every 3 s stops the camera sleeping; poll recording + battery.
      link.timers.push(window.setInterval(() => void enqueue(link, () => write(settings, [0x03, 0x5b, 0x01, 0x42])).catch(() => {}), 3000))
      const poll = () => void enqueue(link, () => write(query, [0x03, 0x13, STATUS_ENCODING, STATUS_BATTERY])).catch(() => {})
      link.timers.push(window.setInterval(poll, 2000))
      poll()
    },
    async setRecording(on) {
      if (on) {
        // Make sure it's in video mode (preset group 1000), then start.
        await enqueue(link, () => write(cmd, [0x04, 0x3e, 0x02, 0x03, 0xe8]))
        await sleep(150)
        await enqueue(link, () => write(cmd, [0x03, 0x01, 0x01, 0x01]))
      } else {
        await enqueue(link, () => write(cmd, [0x03, 0x01, 0x01, 0x00]))
      }
    },
  }
  links.set(id, link)
  track(link, id, name)
  try {
    await link.connect()
    toast(`${name} paired — it will record on its card when you press REC`, 'good')
  } catch (e) {
    update(id, { status: 'lost' })
    throw e
  }
}

// ------------------------------------------------------------------ Sony

const SONY_SERVICE = '8000ff00-ff00-ffff-ffff-ffffffffffff'
const SONY_CMD = '0000ff01-0000-1000-8000-00805f9b34fb'
const SONY_STATUS = '0000ff02-0000-1000-8000-00805f9b34fb'

export async function pairSony() {
  const device = await bt().requestDevice({
    filters: [
      { manufacturerData: [{ companyIdentifier: 0x012d }] },
      { namePrefix: 'ILCE' },
      { namePrefix: 'ILME' },
      { namePrefix: 'ZV' },
      { namePrefix: 'DSC' },
    ],
    optionalServices: [SONY_SERVICE],
  })
  const id = uid('sony')
  const name = device.name || 'Sony camera'
  store.set((s) => ({ remotes: [...s.remotes, { id, kind: 'sony', name, status: 'connecting', recording: null, follow: true }] }))

  let cmd: Char
  const press = async (down: number, up: number) => {
    await enqueue(link, () => write(cmd, [0x01, down]))
    await sleep(120)
    await enqueue(link, () => write(cmd, [0x01, up]))
  }
  const link: Link = {
    device,
    timers: [],
    queue: Promise.resolve(),
    async connect() {
      update(id, { status: 'connecting' })
      const server = await device.gatt!.connect()
      link.server = server
      const svc = await server.getPrimaryService(SONY_SERVICE)
      cmd = await svc.getCharacteristic(SONY_CMD)
      const status = await svc.getCharacteristic(SONY_STATUS)
      status.addEventListener('characteristicvaluechanged', (e) => {
        const v = valueOf(e)
        // 02 D5 20 = recording started, 02 D5 00 = stopped.
        if (v && v.byteLength >= 3 && v.getUint8(0) === 0x02 && v.getUint8(1) === 0xd5) update(id, { recording: v.getUint8(2) === 0x20 })
      })
      await status.startNotifications()
      update(id, { status: 'connected' })
    },
    async setRecording(on) {
      // The record button toggles, so only press it when the state needs to change.
      const cur = store.get().remotes.find((r) => r.id === id)?.recording
      if (cur === on) return
      await press(0x0f, 0x0e)
      if (cur === null) update(id, { recording: on })
    },
    async photo() {
      // Half press → full press → release full → release half, in that order.
      await enqueue(link, () => write(cmd, [0x01, 0x07]))
      await sleep(250)
      await enqueue(link, () => write(cmd, [0x01, 0x09]))
      await sleep(120)
      await enqueue(link, () => write(cmd, [0x01, 0x08]))
      await enqueue(link, () => write(cmd, [0x01, 0x06]))
    },
  }
  links.set(id, link)
  track(link, id, name)
  try {
    await link.connect()
    toast(`${name} paired — it will record on its card when you press REC`, 'good')
  } catch (e) {
    update(id, { status: 'lost' })
    throw e
  }
}

// ------------------------------------------------------------------ shared

export async function setRemoteRecording(id: string, on: boolean) {
  const link = links.get(id)
  const cam = store.get().remotes.find((r) => r.id === id)
  if (!link || !cam || cam.status !== 'connected') return
  try {
    await link.setRecording(on)
  } catch (e) {
    toast(`${cam.name}: couldn't ${on ? 'start' : 'stop'} recording (${(e as Error).message})`, 'bad')
  }
}

export async function remotePhoto(id: string) {
  await links.get(id)?.photo?.()
}

/** Called by the recorder: every connected camera set to follow starts / stops with the take. */
export function recordRemotes(on: boolean) {
  const cams = store.get().remotes.filter((r) => r.follow && r.status === 'connected')
  cams.forEach((r) => void setRemoteRecording(r.id, on))
  return cams.map((r) => r.name)
}

export function forgetRemote(id: string) {
  const link = links.get(id)
  links.delete(id)
  link?.timers.forEach(clearInterval)
  link?.server?.disconnect()
  store.set((s) => ({ remotes: s.remotes.filter((r) => r.id !== id) }))
}

export async function reconnectRemote(id: string) {
  const link = links.get(id)
  if (!link) return
  try {
    await link.connect()
  } catch (e) {
    update(id, { status: 'lost' })
    toast(`Couldn't reconnect: ${(e as Error).message}`, 'bad')
  }
}
