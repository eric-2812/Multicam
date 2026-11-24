import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import {
  BT_HINT,
  addMic,
  addScreen,
  addUrlCamera,
  addWebcam,
  bluetoothSupported,
  guessLink,
  listDevices,
  mediaSupported,
  scanBluetooth,
  unlockDevices,
} from '../engine/devices'
import { joinUrl, onRoomStatus, openRoom, type RoomStatus } from '../engine/phone'
import { store, toast, useStore, type AddTab } from '../store'
import { Icon, LinkBadge } from './Icon'

const TABS: { id: AddTab; label: string; icon: string }[] = [
  { id: 'usb', label: 'USB & built-in', icon: 'usb' },
  { id: 'phone', label: 'Phone over Wi-Fi', icon: 'wifi' },
  { id: 'url', label: 'IP camera', icon: 'network' },
  { id: 'bluetooth', label: 'Bluetooth', icon: 'bluetooth' },
  { id: 'screen', label: 'Screen', icon: 'screen' },
]

function errorText(e: unknown) {
  const err = e as DOMException
  if (err?.name === 'NotAllowedError') return 'Permission was denied. Allow camera/microphone access in the browser’s address bar and try again.'
  if (err?.name === 'NotFoundError') return 'No matching device was found.'
  if (err?.name === 'NotReadableError') return 'The device is busy — close other apps that are using it (Zoom, OBS, FaceTime…).'
  if (err?.name === 'OverconstrainedError') return 'The device cannot do that resolution; try a lower quality.'
  return err?.message || String(e)
}

function useDevices() {
  const [state, setState] = useState<{ cams: MediaDeviceInfo[]; mics: MediaDeviceInfo[]; unlocked: boolean }>({ cams: [], mics: [], unlocked: false })
  const refresh = async () => {
    if (!mediaSupported()) return
    const d = await listDevices()
    const unlocked = [...d.cams, ...d.mics].some((x) => x.label)
    setState({ ...d, unlocked })
  }
  useEffect(() => {
    void refresh()
    const md = navigator.mediaDevices
    md?.addEventListener('devicechange', refresh)
    return () => md?.removeEventListener('devicechange', refresh)
  }, [])
  return { ...state, refresh }
}

function UsbTab() {
  const { cams, mics, unlocked, refresh } = useDevices()
  const [quality, setQuality] = useState<'720' | '1080' | '4k'>('1080')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const usedCams = useStore((s) => s.sources.map((x) => x.detail))
  const usedMics = useStore((s) => s.channels.map((x) => x.detail))

  if (!mediaSupported()) return <p className="note bad">This browser cannot access cameras. Use a recent Chrome, Edge, Safari or Firefox over https.</p>

  const run = async (key: string, f: () => Promise<void>) => {
    setBusy(key)
    setError(null)
    try {
      await f()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="tab-body">
      <p className="lead">Webcams, capture cards (HDMI/SDI → USB), USB microphones and audio interfaces, and anything your computer already sees as a camera or mic.</p>
      {!unlocked && (
        <button className="btn btn-primary" onClick={() => run('unlock', async () => (await unlockDevices(), await refresh()))} disabled={busy === 'unlock'}>
          {busy === 'unlock' ? 'Waiting for permission…' : 'Allow camera & microphone access'}
        </button>
      )}
      {error && <p className="note bad">{error}</p>}

      <div className="dev-head">
        <h4>
          Cameras <span className="count">{cams.length}</span>
        </h4>
        <label className="inline">
          Quality
          <select value={quality} onChange={(e) => setQuality(e.target.value as typeof quality)}>
            <option value="720">720p</option>
            <option value="1080">1080p</option>
            <option value="4k">4K</option>
          </select>
        </label>
      </div>
      <ul className="dev-list">
        {cams.map((c, i) => {
          const label = c.label || `Camera ${i + 1}`
          const added = usedCams.includes(c.label)
          return (
            <li key={c.deviceId || i}>
              <Icon name="cam" />
              <span className="dev-name">{label}</span>
              <LinkBadge link={guessLink(label)} />
              <button className="btn btn-sm" disabled={!unlocked || busy === c.deviceId} onClick={() => run(c.deviceId, () => addWebcam(c, quality))}>
                {added ? 'Add again' : busy === c.deviceId ? 'Opening…' : 'Add'}
              </button>
            </li>
          )
        })}
        {!cams.length && <li className="empty">No cameras found. Plug one in — the list updates by itself.</li>}
      </ul>

      <h4>
        Microphones <span className="count">{mics.length}</span>
      </h4>
      <ul className="dev-list">
        {mics.map((m, i) => {
          const label = m.label || `Microphone ${i + 1}`
          const added = usedMics.includes(m.label)
          return (
            <li key={m.deviceId || i}>
              <Icon name="mic" />
              <span className="dev-name">{label}</span>
              <LinkBadge link={guessLink(label)} />
              <button className="btn btn-sm" disabled={!unlocked || added || busy === m.deviceId} onClick={() => run(m.deviceId, () => addMic(m))}>
                {added ? 'In mixer' : busy === m.deviceId ? 'Opening…' : 'Add'}
              </button>
            </li>
          )
        })}
        {!mics.length && <li className="empty">No microphones found.</li>}
      </ul>
    </div>
  )
}

function PhoneTab() {
  const [room, setRoom] = useState<RoomStatus>({ state: 'idle' })
  const [qr, setQr] = useState('')
  const phones = useStore((s) => s.sources.filter((x) => x.kind === 'phone'))

  useEffect(() => {
    openRoom()
    return onRoomStatus(setRoom)
  }, [])
  const url = room.room ? joinUrl(room.room) : ''
  useEffect(() => {
    if (url) void QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#0b0d12', light: '#ffffff' } }).then(setQr)
  }, [url])

  return (
    <div className="tab-body phone-tab">
      <div className="qr-box">
        {room.state === 'ready' && qr ? <img src={qr} alt="QR code to join from a phone" /> : <div className="qr-wait">{room.state === 'error' ? '!' : '…'}</div>}
      </div>
      <div>
        <p className="lead">Turn any phone or tablet into a wireless camera + mic. Scan the code with the phone’s camera, or open the link on it.</p>
        {room.state === 'opening' && <p className="note">Opening the Wi-Fi link…</p>}
        {room.state === 'error' && (
          <p className="note bad">
            Could not reach the connection broker ({room.error}). Check the internet connection and <button className="linkbtn" onClick={openRoom}>try again</button>.
          </p>
        )}
        {url && (
          <div className="copy-row">
            <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Join link" />
            <button
              className="btn btn-sm"
              onClick={() => {
                void navigator.clipboard?.writeText(url)
                toast('Link copied', 'good')
              }}
            >
              Copy
            </button>
          </div>
        )}
        <ol className="steps">
          <li>Phone and this computer on the same Wi-Fi works best (it also works over mobile data, with more delay).</li>
          <li>On the phone, allow the camera and tap <b>Go live</b>.</li>
          <li>The phone shows a red border when it is on air and green when it is on preview — like a tally light.</li>
        </ol>
        <h4>Connected phones</h4>
        <ul className="dev-list">
          {phones.map((p) => (
            <li key={p.id}>
              <Icon name="phone" />
              <span className="dev-name">{p.name}</span>
              <span className={`status status-${p.status}`}>{p.status}</span>
            </li>
          ))}
          {!phones.length && <li className="empty">Waiting for phones…</li>}
        </ul>
      </div>
    </div>
  )
}

function UrlTab() {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  return (
    <form
      className="tab-body"
      onSubmit={(e) => {
        e.preventDefault()
        if (!/^https?:\/\//i.test(url)) return toast('Enter an http(s):// address', 'bad')
        addUrlCamera(name.trim(), url.trim())
        toast(`${name || 'IP camera'} added`, 'good')
        setUrl('')
        setName('')
      }}
    >
      <p className="lead">Network / IP cameras that publish an HTTP stream: MJPEG (most IP and PTZ cameras, ESP32-CAM, IP Webcam app), MP4/WebM, or HLS (.m3u8, Safari).</p>
      <label className="field">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Back of room" />
      </label>
      <label className="field">
        Stream address
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://192.168.1.50/video.mjpg" inputMode="url" required />
      </label>
      <button className="btn btn-primary" type="submit">
        Add camera
      </button>
      <p className="note">
        Browsers can’t play <b>RTSP</b> directly. If your camera only speaks RTSP, add it in OBS/VLC and use the OBS Virtual Camera from the USB tab, or use its MJPEG/HTTP stream. If this page is on https, the camera must be https too (or open the app locally).
      </p>
    </form>
  )
}

function BluetoothTab() {
  const { mics, unlocked, refresh } = useDevices()
  const bt = mics.filter((m) => BT_HINT.test(m.label))
  const [error, setError] = useState<string | null>(null)
  const used = useStore((s) => s.channels.map((x) => x.detail))
  return (
    <div className="tab-body">
      <h4>Bluetooth microphones & headsets</h4>
      <p className="lead">Pair them in your computer’s Bluetooth settings first — then they appear here and in the USB tab as normal microphones.</p>
      {!unlocked && mediaSupported() && (
        <button className="btn" onClick={() => unlockDevices().then(refresh).catch((e) => setError(errorText(e)))}>
          Allow microphone access to list them
        </button>
      )}
      <ul className="dev-list">
        {bt.map((m) => (
          <li key={m.deviceId}>
            <Icon name="bluetooth" />
            <span className="dev-name">{m.label}</span>
            <button className="btn btn-sm" disabled={used.includes(m.label)} onClick={() => addMic(m).catch((e) => setError(errorText(e)))}>
              {used.includes(m.label) ? 'In mixer' : 'Add'}
            </button>
          </li>
        ))}
        {unlocked && !bt.length && <li className="empty">No Bluetooth mics detected. Paired devices with unusual names may be listed in the USB tab.</li>}
      </ul>

      <h4>Bluetooth LE accessories</h4>
      <p className="lead">Camera remotes, gimbals, lav transmitters and other low-energy devices: pair to see their connection and battery level.</p>
      {bluetoothSupported() ? (
        <button
          className="btn btn-primary"
          onClick={() =>
            scanBluetooth().catch((e) => {
              if ((e as DOMException).name !== 'NotFoundError') setError(errorText(e))
            })
          }
        >
          <Icon name="scan" /> Scan for devices
        </button>
      ) : (
        <p className="note">This browser has no Web Bluetooth. Use Chrome or Edge on desktop or Android.</p>
      )}
      {error && <p className="note bad">{error}</p>}
      <p className="note">Bluetooth is too slow for live video, so wireless cameras connect over Wi-Fi (see “Phone over Wi-Fi” and “IP camera”).</p>
    </div>
  )
}

function ScreenTab() {
  const [error, setError] = useState<string | null>(null)
  const ok = !!navigator.mediaDevices?.getDisplayMedia
  return (
    <div className="tab-body">
      <p className="lead">Use a screen, window or browser tab as a source — slides, a video call, a game. Tick “share audio” to bring its sound into the mixer.</p>
      {ok ? (
        <button className="btn btn-primary" onClick={() => addScreen().catch((e) => (e as DOMException).name !== 'NotAllowedError' && setError(errorText(e)))}>
          <Icon name="screen" /> Choose what to share
        </button>
      ) : (
        <p className="note bad">Screen sharing isn’t available in this browser (most phones can’t share their screen).</p>
      )}
      {error && <p className="note bad">{error}</p>}
    </div>
  )
}

export function AddDevice() {
  const open = useStore((s) => s.addOpen)
  const tab = useStore((s) => s.addTab)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && store.set({ addOpen: false })
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  if (!open) return null
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && store.set({ addOpen: false })}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Add a device">
        <header className="modal-head">
          <h2>Add a device</h2>
          <button className="icon-btn" onClick={() => store.set({ addOpen: false })} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-on' : ''} onClick={() => store.set({ addTab: t.id })}>
              <Icon name={t.icon} size={14} />
              {t.label}
            </button>
          ))}
        </nav>
        {tab === 'usb' && <UsbTab />}
        {tab === 'phone' && <PhoneTab />}
        {tab === 'url' && <UrlTab />}
        {tab === 'bluetooth' && <BluetoothTab />}
        {tab === 'screen' && <ScreenTab />}
      </div>
    </div>
  )
}
