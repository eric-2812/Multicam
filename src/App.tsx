import { Icon } from './components/Icon'
import { PhoneSender } from './components/PhoneSender'
import { Shell } from './components/Shell'
import { audio } from './engine/audio'
import { store, useStore, type AddTab } from './store'

/** Where each kind of camera gets connected. */
const SOURCES: { tab: AddTab; icon: string; title: string; how: string }[] = [
  { tab: 'usb', icon: 'usb', title: 'Webcam or capture card', how: 'USB, HDMI or SDI capture, built-in cameras' },
  { tab: 'iphone', icon: 'phone', title: 'iPhone', how: 'Continuity Camera or Wi-Fi, records its own copy' },
  { tab: 'gopro', icon: 'cam', title: 'GoPro', how: 'Webcam mode over USB; record on the card via Bluetooth' },
  { tab: 'sony', icon: 'camera', title: 'Sony Alpha', how: 'USB streaming or HDMI; start recording via Bluetooth' },
  { tab: 'phone', icon: 'wifi', title: 'Android phone', how: 'Over Wi-Fi with a QR code' },
  { tab: 'mirrorless', icon: 'camera', title: 'Canon, Nikon, Fuji or Lumix', how: 'USB webcam mode or HDMI capture' },
  { tab: 'url', icon: 'network', title: 'IP or PTZ camera', how: 'MJPEG, MP4 or HLS address' },
  { tab: 'screen', icon: 'screen', title: 'Screen or app window', how: 'Share a screen, a window or a browser tab' },
]

/** Sound sources: every mic becomes its own channel and file. */
const SOUND: { tab: AddTab; icon: string; title: string; how: string }[] = [
  { tab: 'mic', icon: 'mic', title: 'Microphone or audio interface', how: 'USB mics, XLR through an interface, wireless lav receivers' },
  { tab: 'bluetooth', icon: 'bluetooth', title: 'Bluetooth headset or mic', how: 'Pair it with the computer first, then add it' },
]

function Welcome() {
  const open = (tab: AddTab) => {
    audio.ensure()
    store.set({ started: true, page: 'setup', setupSection: 'devices', addTab: tab })
  }
  return (
    <main className="welcome">
      <div className="welcome-inner">
        <div className="hdr-brand">
          <span className="mark" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="hdr-name">Cortiva</span>
        </div>
        <h1>Record every camera at once, in sync.</h1>
        <p className="welcome-lead">
          Plug in or pair your cameras and microphones, set each one up from here, and press record. Every camera and every mic writes its own file with the same start
          timecode, ready for a multicam edit.
        </p>
        <h2 className="welcome-h">What are you connecting?</h2>
        <ul className="welcome-src">
          {SOURCES.map((s) => (
            <li key={s.tab}>
              <button onClick={() => open(s.tab)}>
                <Icon name={s.icon} size={18} />
                <span>
                  <b>{s.title}</b>
                  <small>{s.how}</small>
                </span>
                <Icon name="chevron" size={14} className="welcome-go" />
              </button>
            </li>
          ))}
        </ul>
        <h2 className="welcome-h">And for sound?</h2>
        <ul className="welcome-src">
          {SOUND.map((s) => (
            <li key={s.title}>
              <button onClick={() => open(s.tab)}>
                <Icon name={s.icon} size={18} />
                <span>
                  <b>{s.title}</b>
                  <small>{s.how}</small>
                </span>
                <Icon name="chevron" size={14} className="welcome-go" />
              </button>
            </li>
          ))}
        </ul>
        {import.meta.env.VITE_PREVIEW === '1' && (
          <p className="note">This browser preview can't reach cameras, microphones, Bluetooth or files. Open the full app to connect devices.</p>
        )}
      </div>
    </main>
  )
}

export function App() {
  const started = useStore((s) => s.started)
  const join = new URLSearchParams(location.search).get('join')
  if (join) return <PhoneSender room={join} />
  return started ? <Shell /> : <Welcome />
}
