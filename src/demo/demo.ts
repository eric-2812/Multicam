import { audio } from '../engine/audio'
import { newChannel, newSource, removeChannel, removeSource } from '../engine/devices'
import { store, toast, updateSource } from '../store'
import { DEFAULT_SETTINGS, type Accessory, type AudioChannel, type HwCaps, type VideoSource } from '../types'

let timer = 0
let ids: { sources: string[]; channels: string[]; accessories: string[] } = { sources: [], channels: [], accessories: [] }

/** Load a full simulated studio: six cameras, five mics and a few Bluetooth accessories. */
export function loadDemo() {
  if (store.get().demo) return
  audio.ensure()
  const cam = (p: Partial<VideoSource> & Pick<VideoSource, 'name' | 'link' | 'detail' | 'scene'>) =>
    newSource({ kind: 'demo', ...p, settings: { ...DEFAULT_SETTINGS, ...p.settings } })
  // Simulated lenses: each ring only shows up where the real device would have one.
  const FULL: HwCaps = { width: 1920, height: 1080, fps: 30, focus: [0, 1], aperture: [1.4, 16], shutter: [15, 8000] }
  const PTZ: HwCaps = { width: 3840, height: 2160, fps: 30, focus: [0, 1], aperture: [1.4, 11], shutter: [25, 4000] }
  const WEBCAM: HwCaps = { width: 1920, height: 1080, fps: 30, focus: [0, 1], shutter: [30, 2000] }
  const PHONE: HwCaps = { width: 1920, height: 1080, fps: 30, focus: [0, 1], shutter: [15, 4000] }
  const DRONE: HwCaps = { width: 3840, height: 2160, fps: 30, shutter: [30, 8000] }

  const wide = cam({ name: 'Studio Wide', scene: 'stage', link: 'network', detail: 'PTZ 20× · Ethernet / NDI', ptz: true, hw: PTZ })
  const host = cam({ name: 'Host CU', scene: 'host', link: 'usb', detail: 'Mirrorless · USB-C capture', hw: FULL })
  const guest = cam({ name: 'Guest CU', scene: 'guest', link: 'wifi', detail: 'Mirrorless · Wi-Fi transmitter', battery: 78, signal: 4, hw: { ...FULL, aperture: [2, 22] } })
  const desk = cam({ name: 'Desk Overhead', scene: 'overhead', link: 'usb', detail: 'Webcam 1080p · USB', hw: WEBCAM })
  const drone = cam({ name: 'Drone', scene: 'drone', link: 'wifi', detail: 'Drone · 5.8 GHz video link', battery: 64, signal: 3, hw: DRONE })
  const crowd = cam({ name: 'Audience', scene: 'crowd', link: 'wifi', detail: 'Phone · Wi-Fi', battery: 52, signal: 3, hw: PHONE })
  const roam = cam({
    name: 'Roaming Gimbal',
    scene: 'stage',
    link: 'bluetooth',
    detail: 'Phone on gimbal · Wi-Fi video, BT control',
    ptz: true,
    battery: 41,
    signal: 2,
    status: 'connecting',
    hw: PHONE,
    settings: { ...DEFAULT_SETTINGS, zoom: 1.9, pan: 0.35, tilt: -0.1 },
  })
  wide.presets = [{ zoom: 1, pan: 0, tilt: 0 }, { zoom: 2.4, pan: -0.45, tilt: -0.05 }, { zoom: 2.4, pan: 0.45, tilt: -0.08 }, { zoom: 1.6, pan: 0, tilt: -0.25 }, null, null]
  const sources = [wide, host, guest, desk, drone, crowd, roam]

  const ch = (p: Partial<AudioChannel> & Pick<AudioChannel, 'name' | 'link' | 'detail' | 'voice'>) => newChannel({ kind: 'demo', ...p })
  const channels = [
    ch({ name: 'Host Lav', voice: 'host', link: 'bluetooth', detail: 'Wireless lav · Bluetooth', battery: 86 }),
    ch({ name: 'Guest Lav', voice: 'guest', link: 'bluetooth', detail: 'Wireless lav · Bluetooth', battery: 71, pan: 0 }),
    ch({ name: 'Room Mic', voice: 'room', link: 'usb', detail: 'Shotgun · XLR → USB', gain: 0.8 }),
    ch({ name: 'Music Bed', voice: 'music', link: 'usb', detail: 'Playback · USB interface', gain: 0.55 }),
    ch({ name: 'Audience', voice: 'crowd', link: 'wifi', detail: 'Phone mic · Wi-Fi', afv: crowd.id, battery: 52 }),
  ]
  const accessories: Accessory[] = [
    { id: 'acc-gimbal', name: 'Gimbal Remote', detail: 'Bluetooth LE · joystick', battery: 58, link: 'bluetooth', status: 'connected' },
    { id: 'acc-remote', name: 'Camera Remote', detail: 'Bluetooth LE · shutter / zoom', battery: 91, link: 'bluetooth', status: 'connected' },
    { id: 'acc-tally', name: 'Tally Light Hub', detail: 'Wi-Fi · 6 lights', link: 'wifi', status: 'connected' },
  ]

  channels.forEach((c) => audio.addDemo(c))
  ids = { sources: sources.map((s) => s.id), channels: channels.map((c) => c.id), accessories: accessories.map((a) => a.id) }

  store.set((s) => ({
    demo: true,
    sources: [...sources, ...s.sources],
    channels: [...channels, ...s.channels],
    accessories: [...accessories, ...s.accessories],
    program: wide.id,
    preview: host.id,
    selected: wide.id,
  }))

  setTimeout(() => {
    updateSource(roam.id, { status: 'live' })
    toast('Roaming Gimbal connected over Wi-Fi', 'good')
  }, 3500)

  let ticks = 0
  timer = window.setInterval(() => {
    ticks++
    const st = store.get()
    store.set({
      sources: st.sources.map((s) => {
        if (!ids.sources.includes(s.id)) return s
        const next = { ...s }
        if (s.battery !== undefined) next.battery = Math.max(3, s.battery - Math.random() * 0.12)
        if (s.signal !== undefined && s.status === 'live' && Math.random() < 0.25) {
          next.signal = Math.max(1, Math.min(4, s.signal + (Math.random() < 0.5 ? -1 : 1)))
        }
        return next
      }),
      channels: st.channels.map((c) =>
        ids.channels.includes(c.id) && c.battery !== undefined ? { ...c, battery: Math.max(3, c.battery - Math.random() * 0.08) } : c,
      ),
    })
    // Every so often the drone flies out of range for a moment — unless it's on air.
    if (ticks % 37 === 0 && store.get().program !== drone.id) {
      updateSource(drone.id, { status: 'lost', signal: 0 })
      toast('Drone: video link lost — reconnecting…', 'bad')
      setTimeout(() => {
        updateSource(drone.id, { status: 'live', signal: 2 })
        toast('Drone reconnected', 'good')
      }, 3000)
    }
  }, 2000)
}

export function unloadDemo() {
  clearInterval(timer)
  ids.sources.forEach(removeSource)
  ids.channels.forEach(removeChannel)
  store.set((s) => ({ demo: false, accessories: s.accessories.filter((a) => !ids.accessories.includes(a.id)) }))
  ids = { sources: [], channels: [], accessories: [] }
}
