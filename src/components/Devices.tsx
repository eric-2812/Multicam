import QRCode from 'qrcode'
import { useEffect, useState, type ReactNode } from 'react'
import {
  BT_HINT,
  addMic,
  addScreen,
  addUrlCamera,
  addWebcam,
  bluetoothSupported,
  guessLink,
  removeChannel,
  removeSource,
  listDevices,
  mediaSupported,
  scanBluetooth,
  unlockDevices,
} from '../engine/devices'
import { bleSupported, forgetRemote, pairGoPro, pairSony, reconnectRemote, remotePhoto, setRemoteRecording } from '../engine/bluecams'
import { joinUrl, onRoomStatus, openRoom, type RoomStatus } from '../engine/phone'
import { store, toast, useStore, type AddTab } from '../store'
import { Icon, LinkBadge } from './Icon'
import { Seg, Switch } from './ui'

const TABS: { id: AddTab; label: string; icon: string }[] = [
  { id: 'usb', label: 'Cameras (USB & capture)', icon: 'usb' },
  { id: 'mic', label: 'Microphones', icon: 'mic' },
  { id: 'iphone', label: 'iPhone', icon: 'phone' },
  { id: 'gopro', label: 'GoPro', icon: 'cam' },
  { id: 'sony', label: 'Sony Alpha', icon: 'camera' },
  { id: 'mirrorless', label: 'Canon · Nikon · Fuji · Lumix', icon: 'camera' },
  { id: 'phone', label: 'Android / Wi-Fi', icon: 'wifi' },
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
  const { cams, unlocked, refresh } = useDevices()
  const [quality, setQuality] = useState<'720' | '1080' | '4k'>('1080')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const usedCams = useStore((s) => s.sources.map((x) => x.detail))

  if (!mediaSupported()) return <p className="note bad">This browser cannot access cameras. Use a recent Chrome, Edge, Safari or Firefox over https.</p>

  const run = async (key: string, f: () => Promise<unknown>) => {
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
      <p className="lead">Webcams, capture cards (HDMI/SDI → USB) and anything your computer already sees as a camera.</p>
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
        {!cams.length && <li className="dev-empty">No cameras found. Plug one in — the list updates by itself.</li>}
      </ul>

      <p className="hint">
        Microphones are in the{' '}
        <button className="linkbtn" onClick={() => store.set({ addTab: 'mic' })}>
          Microphones
        </button>{' '}
        tab.
      </p>
    </div>
  )
}

/** Every audio input the computer sees: each becomes a mixer channel and its own recorded file. */
function MicTab() {
  const { mics, unlocked, refresh } = useDevices()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const usedMics = useStore((s) => s.channels.map((x) => x.detail))
  if (!mediaSupported()) return <p className="note bad">This browser cannot access microphones. Use a recent Chrome, Edge, Safari or Firefox over https.</p>
  const run = async (key: string, f: () => Promise<unknown>) => {
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
      <p className="lead">Each microphone gets its own channel in the mixer and its own audio file in every take. Cameras don’t bring their sound by themselves — add their mic here if you want it.</p>
      <ul className="steps">
        <li>
          <b>USB microphones and audio interfaces</b> (XLR mics through a Focusrite, Zoom, Rodecaster…): plug in and add them below.
        </li>
        <li>
          <b>Wireless lavs</b> (RØDE Wireless GO, DJI Mic, Hollyland…): plug the receiver into the computer with USB-C; it shows up as a microphone.
        </li>
        <li>
          <b>Camera audio</b>: a Sony in USB streaming mode or a capture card also appears here as a microphone.
        </li>
        <li>
          <b>Bluetooth headsets and mics</b>: pair them in your computer’s Bluetooth settings first — see the Bluetooth tab.
        </li>
        <li>
          <b>Phones</b> joined over Wi-Fi bring their microphone automatically.
        </li>
      </ul>
      {!unlocked && (
        <button className="btn btn-primary" onClick={() => run('unlock', async () => (await unlockDevices(), await refresh()))} disabled={busy === 'unlock'}>
          {busy === 'unlock' ? 'Waiting for permission…' : 'Allow microphone access'}
        </button>
      )}
      {error && <p className="note bad">{error}</p>}
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
        {!mics.length && <li className="dev-empty">{unlocked ? 'No microphones found. Plug one in — the list updates by itself.' : 'Allow access to see your microphones.'}</li>}
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
          <li>
            Here, tap <b>Allow</b> when the phone asks to join. Nothing gets in without it, even with the link; a phone you allowed reconnects on its own if
            the Wi-Fi drops.
          </li>
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
          {!phones.length && <li className="dev-empty">Waiting for phones…</li>}
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
        {unlocked && !bt.length && <li className="dev-empty">No Bluetooth mics detected. Paired devices with unusual names may be listed in the USB tab.</li>}
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

// ------------------------------------------------------------------ camera families

/** Video devices the computer already sees whose name matches, with one-click add. */
function Detected(props: { match: RegExp; what: string; mics?: boolean }) {
  const { cams, mics, unlocked, refresh } = useDevices()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const used = useStore((s) => [...s.sources.map((x) => x.detail), ...s.channels.map((x) => x.detail)])
  const found = cams.filter((c) => props.match.test(c.label))
  const foundMics = props.mics ? mics.filter((m) => props.match.test(m.label)) : []
  const run = async (key: string, f: () => Promise<unknown>) => {
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
  if (!mediaSupported()) return <p className="note bad">This browser cannot access cameras. Use Chrome, Edge or Safari over https.</p>
  return (
    <div className="detected">
      {!unlocked ? (
        <button className="btn" onClick={() => run('unlock', async () => (await unlockDevices(), await refresh()))} disabled={busy === 'unlock'}>
          {busy === 'unlock' ? 'Waiting for permission…' : `Look for a connected ${props.what}`}
        </button>
      ) : (
        <ul className="dev-list">
          {found.map((c) => (
            <li key={c.deviceId}>
              <Icon name="cam" />
              <span className="dev-name">{c.label}</span>
              <button className="btn btn-sm" disabled={busy === c.deviceId} onClick={() => run(c.deviceId, () => addWebcam(c, '4k'))}>
                {used.includes(c.label) ? 'Add again' : busy === c.deviceId ? 'Opening…' : 'Add camera'}
              </button>
            </li>
          ))}
          {foundMics.map((m) => (
            <li key={m.deviceId}>
              <Icon name="mic" />
              <span className="dev-name">{m.label}</span>
              <button className="btn btn-sm" disabled={used.includes(m.label) || busy === m.deviceId} onClick={() => run(m.deviceId, () => addMic(m))}>
                {used.includes(m.label) ? 'In mixer' : 'Add mic'}
              </button>
            </li>
          ))}
          {!found.length && !foundMics.length && <li className="dev-empty">No {props.what} found yet. Follow the steps above — the list updates by itself.</li>}
        </ul>
      )}
      {error && <p className="note bad">{error}</p>}
    </div>
  )
}

const REMOTE_LABEL = { gopro: 'GoPro', sony: 'Sony' } as const

/** Cameras paired over Bluetooth, with their card-recording state. */
function RemoteList({ kind }: { kind: 'gopro' | 'sony' }) {
  const remotes = useStore((s) => s.remotes.filter((r) => r.kind === kind))
  const recording = useStore((s) => !!s.recordingSince)
  if (!remotes.length) return null
  return (
    <ul className="dev-list">
      {remotes.map((r) => (
        <li key={r.id} className="remote">
          <Icon name="bluetooth" />
          <span className="dev-name">
            {r.name}
            <small>
              <span className={`status status-${r.status === 'connected' ? 'live' : r.status}`}>{r.status}</span>
              {r.battery !== undefined && ` · ${r.battery}% battery`}
              {r.recording === true && ' · recording on card'}
            </small>
          </span>
          <label className="inline" title={`Start and stop this ${REMOTE_LABEL[kind]} with Cortiva's REC`}>
            With REC
            <Switch label={`Record ${r.name} with Cortiva`} on={r.follow} onChange={(v) => store.set((s) => ({ remotes: s.remotes.map((x) => (x.id === r.id ? { ...x, follow: v } : x)) }))} />
          </label>
          {r.status === 'connected' ? (
            <button className={`btn btn-sm ${r.recording ? 'btn-danger' : ''}`} onClick={() => void setRemoteRecording(r.id, !r.recording)}>
              {r.recording ? 'Stop' : 'Record'}
            </button>
          ) : (
            <button className="btn btn-sm" onClick={() => void reconnectRemote(r.id)}>
              Reconnect
            </button>
          )}
          {kind === 'sony' && r.status === 'connected' && (
            <button className="btn btn-sm btn-ghost" onClick={() => void remotePhoto(r.id)}>
              Photo
            </button>
          )}
          <button className="icon-btn" aria-label={`Forget ${r.name}`} disabled={recording} onClick={() => forgetRemote(r.id)}>
            <Icon name="trash" size={13} />
          </button>
        </li>
      ))}
    </ul>
  )
}

function PairButton({ kind }: { kind: 'gopro' | 'sony' }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!bleSupported()) {
    return <p className="note">Recording on the camera needs Bluetooth in the browser: Chrome or Edge on a Mac, Windows PC, Chromebook or Android. Safari and Firefox don’t have it.</p>
  }
  return (
    <>
      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            await (kind === 'gopro' ? pairGoPro() : pairSony())
          } catch (e) {
            const err = e as DOMException
            if (err.name !== 'NotFoundError') setError(err.message || String(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        <Icon name="bluetooth" size={14} /> {busy ? 'Connecting…' : `Pair a ${REMOTE_LABEL[kind]}`}
      </button>
      {error && <p className="note bad">Couldn't connect: {error}. Check the camera is in pairing mode and close the {REMOTE_LABEL[kind]} phone app if it's connected.</p>}
    </>
  )
}

function IphoneTab() {
  // The Wi-Fi link only opens when asked for, so browsing this tab doesn't touch the network.
  const [wifi, setWifi] = useState(false)
  return (
    <div className="tab-body">
      <h4>On a Mac: Continuity Camera</h4>
      <ol className="steps">
        <li>iPhone on iOS 16 or later, Mac on macOS 13 or later, same Apple ID, Wi-Fi and Bluetooth on.</li>
        <li>Mount the iPhone in landscape, screen locked, near the Mac (or plugged in with a cable).</li>
        <li>It shows up as a camera called “iPhone Camera” — add it below. Its microphone appears too.</li>
      </ol>
      <Detected match={/iphone|continuity|desk view/i} what="iPhone" mics />

      <h4>Anywhere: over Wi-Fi</h4>
      <p className="lead">Works with any iPhone or iPad and any computer. Open the link on the iPhone in Safari. While Cortiva records, the iPhone also records its own full-quality file (saved to Files → Downloads).</p>
      {wifi ? (
        <PhoneTab />
      ) : (
        <div>
          <button className="btn" onClick={() => setWifi(true)}>
            <Icon name="wifi" size={14} /> Show the QR code
          </button>
        </div>
      )}

      <h4>With a cable on Windows</h4>
      <p className="lead">Apps like Camo or EpocCam turn the iPhone into a USB webcam. Once installed, it appears in “USB & capture”.</p>
    </div>
  )
}

function GoProTab() {
  return (
    <div className="tab-body">
      <h4>Picture into Cortiva</h4>
      <ol className="steps">
        <li>HERO8 or later: install the GoPro Webcam app on the computer (Mac or Windows) and connect the GoPro with its USB-C cable.</li>
        <li>Start webcam mode from the app. The GoPro appears as “GoPro Webcam” (up to 1080p) — add it below.</li>
        <li>For HDMI instead: HERO9–11 with the Media Mod, or HERO12–13 with the Media Mod, into any HDMI capture card (then use “USB & capture”).</li>
      </ol>
      <Detected match={/gopro/i} what="GoPro" />

      <h4>Record on the GoPro's card</h4>
      <p className="lead">
        Pair HERO9 or later over Bluetooth and it records full quality to its own card whenever you press REC, with battery and recording state shown here. On the camera, open
        Preferences → Connections → Connect Device → GoPro Quik to put it in pairing mode.
      </p>
      <PairButton kind="gopro" />
      <RemoteList kind="gopro" />
      <p className="hint">A GoPro in webcam mode can’t record to its card at the same time — use the card for the best quality, and webcam or HDMI for the live picture.</p>
    </div>
  )
}

function SonyTab() {
  return (
    <div className="tab-body">
      <h4>Picture into Cortiva</h4>
      <ol className="steps">
        <li>USB streaming (a7 IV, a7S III, FX3, ZV series…): connect the camera’s USB-C port and choose “Live Stream (USB Streaming)” when it asks. It becomes a webcam and a microphone — add them below.</li>
        <li>4K and 1080p need a 10 Gbps USB-C port and cable; on USB 2 the camera sends 720p.</li>
        <li>Or use clean HDMI out into a capture card (turn off HDMI info display on the camera), then add it from “USB & capture”.</li>
      </ol>
      <Detected match={/sony|ilce|ilme|zv-|fx3|fx30|usb streaming/i} what="Sony camera" mics />

      <h4>Start recording on the camera</h4>
      <p className="lead">
        Pair the camera over Bluetooth as a remote and it starts and stops recording to its card with REC. On the camera: Network → Bluetooth → Bluetooth Function On, then Bluetooth Rmt
        Ctrl On, then Pairing. Make sure the camera isn’t recording when you pair it.
      </p>
      <PairButton kind="sony" />
      <RemoteList kind="sony" />
      <p className="hint">
        This uses the same Bluetooth commands as Sony’s RMT-P1BT remote, documented by the community; it’s confirmed on the a7 III and ZV-1F and should work on any model that supports
        that remote, including the a7 IV.
      </p>
    </div>
  )
}

type Brand = 'canon' | 'nikon' | 'fujifilm' | 'lumix'

/** How each brand's cameras get their picture into a computer: built-in webcam mode, the maker's app, or HDMI. */
const BRANDS: Record<Brand, { label: string; match: RegExp; what: string; steps: ReactNode[]; note: string }> = {
  canon: {
    label: 'Canon',
    match: /canon|eos/i,
    what: 'Canon camera',
    steps: [
      <>Recent EOS models (for example the EOS R8 and R5 Mark II) work as a USB webcam on their own (UVC/UAC, 1080p with sound): turn the camera on in movie mode and connect its USB-C port to the computer.</>,
      <>
        Other EOS and PowerShot models: install <b>EOS Webcam Utility</b> from Canon’s website, then connect the camera by USB. It shows up as “EOS Webcam Utility”.
      </>,
      <>For full quality and the lowest delay, use clean HDMI out into a capture card instead (then add it from “USB & capture”).</>,
    ],
    note: 'EOS Webcam Utility’s free version is limited; Canon sells a Pro subscription with higher resolution.',
  },
  nikon: {
    label: 'Nikon',
    match: /nikon/i,
    what: 'Nikon camera',
    steps: [
      <>
        Z6III (firmware 2.0 or later), Z f and Z50II: on the camera, Network menu → <b>USB</b> → <b>USB streaming (UVC/UAC)</b>, then connect the USB cable. No software needed.
      </>,
      <>
        Other Z and DSLR models: install <b>Nikon Webcam Utility</b> from Nikon’s website and connect by USB.
      </>,
      <>For full quality, use clean HDMI out into a capture card (then add it from “USB & capture”).</>,
    ],
    note: 'USB streaming stops if the camera starts recording, its USB setting changes or the cable comes out.',
  },
  fujifilm: {
    label: 'Fujifilm',
    match: /fujifilm|fuji|x webcam/i,
    what: 'Fujifilm camera',
    steps: [
      <>
        Newer X and GFX models: SET-UP → CONNECTION SETTING → CONNECTION MODE → <b>USB WEBCAM</b>, then connect by USB. No software needed.
      </>,
      <>
        Models without that option (X-T4, X-S10, X-Pro3, X100V and older): install <b>FUJIFILM X Webcam</b> (on macOS 14 or later, the version made for it) and connect by USB.
      </>,
      <>For full quality, use clean HDMI out into a capture card (then add it from “USB & capture”).</>,
    ],
    note: 'If the camera menu shows a webcam connection mode, use that rather than the X Webcam app — the two don’t work together.',
  },
  lumix: {
    label: 'Lumix',
    match: /lumix|panasonic/i,
    what: 'Lumix camera',
    steps: [
      <>
        Newer models: set the camera’s USB mode to <b>PC (Webcam)</b> and connect by USB. No software needed.
      </>,
      <>
        Older models (S1, S5, GH5, G9 and similar): update the camera firmware, install <b>LUMIX Webcam Software</b> (beta) and connect by USB.
      </>,
      <>For full quality, use clean HDMI out into a capture card (then add it from “USB & capture”).</>,
    ],
    note: 'Panasonic labels its webcam software a beta without support; the built-in webcam mode or HDMI are more reliable.',
  },
}

function MirrorlessTab() {
  const [brand, setBrand] = useState<Brand>('canon')
  const b = BRANDS[brand]
  return (
    <div className="tab-body">
      <Seg label="Camera brand" value={brand} options={(Object.keys(BRANDS) as Brand[]).map((k) => ({ v: k, label: BRANDS[k].label }))} onChange={setBrand} />
      <h4>Picture into Cortiva</h4>
      <ol className="steps">
        {b.steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
      <Detected match={b.match} what={b.what} mics />
      <h4>Tips for long shoots</h4>
      <ul className="steps">
        <li>Power it from the mains (dummy battery or USB-C power) and turn off auto power-off.</li>
        <li>For HDMI, turn off the on-screen info on the HDMI output so the picture is clean.</li>
        <li>A camera streaming over USB usually can’t record to its own card at the same time; with HDMI it can.</li>
      </ul>
      <p className="hint">{b.note} Camera settings show up here only when the camera reports them to the computer; most cameras in webcam mode don’t.</p>
    </div>
  )
}

function Connected() {
  const recording = useStore((s) => !!s.recordingSince)
  const sources = useStore((s) => s.sources)
  const channels = useStore((s) => s.channels)
  const accessories = useStore((s) => s.accessories)
  const remotes = useStore((s) => s.remotes)
  return (
    <div className="dev-connected">
      <table className="tbl">
        <thead>
          <tr>
            <th>#</th>
            <th>Device</th>
            <th className="hide-sm">Type</th>
            <th className="hide-sm">Connection</th>
            <th>Status</th>
            <th className="num hide-sm">Latency</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => (
            <tr key={s.id}>
              <td className="mono">{s.number}</td>
              <td>
                <b>{s.name}</b>
                <small>{s.detail}</small>
              </td>
              <td className="hide-sm">Camera</td>
              <td className="hide-sm">
                <LinkBadge link={s.link} />
              </td>
              <td>
                <span className={`status status-${s.status}`}>{s.status}</span>
              </td>
              <td className="num mono hide-sm">{s.latency !== undefined ? `${s.latency} ms` : '—'}</td>
              <td className="num">
                <button className="icon-btn" aria-label={`Remove ${s.name}`} disabled={recording} title={recording ? 'Stop recording first' : undefined} onClick={() => removeSource(s.id)}>
                  <Icon name="trash" size={13} />
                </button>
              </td>
            </tr>
          ))}
          {channels.map((c, i) => (
            <tr key={c.id}>
              <td className="mono">A{i + 1}</td>
              <td>
                <b>{c.name}</b>
                <small>{c.detail}</small>
              </td>
              <td className="hide-sm">Microphone</td>
              <td className="hide-sm">
                <LinkBadge link={c.link} />
              </td>
              <td>
                <span className={`status status-${c.status}`}>{c.status}</span>
              </td>
              <td className="num mono hide-sm">{c.latency !== undefined ? `${c.latency} ms` : '—'}</td>
              <td className="num">
                <button className="icon-btn" aria-label={`Remove ${c.name}`} disabled={recording} title={recording ? 'Stop recording first' : undefined} onClick={() => removeChannel(c.id)}>
                  <Icon name="trash" size={13} />
                </button>
              </td>
            </tr>
          ))}
          {accessories.map((a) => (
            <tr key={a.id}>
              <td className="mono">—</td>
              <td>
                <b>{a.name}</b>
                <small>{a.detail}</small>
              </td>
              <td className="hide-sm">Accessory</td>
              <td className="hide-sm">
                <LinkBadge link={a.link} />
              </td>
              <td>
                <span className={`status status-${a.status === 'connected' ? 'live' : 'lost'}`}>{a.status}</span>
              </td>
              <td className="num mono hide-sm">{a.battery !== undefined ? `${Math.round(a.battery)}% batt.` : '—'}</td>
              <td className="num">
                <button className="icon-btn" aria-label={`Forget ${a.name}`} onClick={() => store.set((st) => ({ accessories: st.accessories.filter((x) => x.id !== a.id) }))}>
                  <Icon name="trash" size={13} />
                </button>
              </td>
            </tr>
          ))}
          {remotes.map((r) => (
            <tr key={r.id}>
              <td className="mono">—</td>
              <td>
                <b>{r.name}</b>
                <small>Records on its own card{r.follow ? ' with REC' : ''}</small>
              </td>
              <td className="hide-sm">{r.kind === 'gopro' ? 'GoPro' : 'Sony'} (card)</td>
              <td className="hide-sm">
                <LinkBadge link="bluetooth" />
              </td>
              <td>
                <span className={`status status-${r.status === 'connected' ? 'live' : r.status}`}>{r.recording ? 'recording' : r.status}</span>
              </td>
              <td className="num mono hide-sm">{r.battery !== undefined ? `${r.battery}% batt.` : '—'}</td>
              <td className="num">
                <button className="icon-btn" aria-label={`Forget ${r.name}`} disabled={recording} onClick={() => forgetRemote(r.id)}>
                  <Icon name="trash" size={13} />
                </button>
              </td>
            </tr>
          ))}
          {!sources.length && !channels.length && !accessories.length && !remotes.length && (
            <tr>
              <td colSpan={7} className="empty-row">
                Nothing connected yet. Add a camera or microphone below.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/** Setup → Devices: what's connected, and every way to add more. */
export function DevicesSection() {
  const tab = useStore((s) => s.addTab)
  return (
    <>
      <h3 className="set-h">Connected</h3>
      <Connected />
      <h3 className="set-h">Add a device</h3>
      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-on' : ''} onClick={() => store.set({ addTab: t.id })}>
            <Icon name={t.icon} size={14} />
            {t.label}
          </button>
        ))}
      </nav>
      <div className="tab-panel">
        {tab === 'usb' && <UsbTab />}
        {tab === 'mic' && <MicTab />}
        {tab === 'iphone' && <IphoneTab />}
        {tab === 'gopro' && <GoProTab />}
        {tab === 'sony' && <SonyTab />}
        {tab === 'mirrorless' && <MirrorlessTab />}
        {tab === 'phone' && <PhoneTab />}
        {tab === 'url' && <UrlTab />}
        {tab === 'bluetooth' && <BluetoothTab />}
        {tab === 'screen' && <ScreenTab />}
      </div>
    </>
  )
}
