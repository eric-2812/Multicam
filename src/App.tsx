import { PhoneSender } from './components/PhoneSender'
import { Shell } from './components/Shell'
import { Icon } from './components/Icon'
import { loadDemo } from './demo/demo'
import { audio } from './engine/audio'
import { store, useStore } from './store'

const FEATURES: [string, string, string][] = [
  ['film', 'Records every camera', 'Each camera and mic to its own file, all starting on the same frame — ready for a multicam edit.'],
  ['settings', 'Full camera control', 'Focus, iris, shutter, ISO, ND, white balance, profiles, PTZ and presets — whatever each camera supports.'],
  ['clock', 'One timecode', 'Master clock, lip-sync alignment, slate, markers and EDL / take sheets for the edit.'],
  ['wifi', 'Any connection', 'USB and capture cards, phones over Wi-Fi, IP cameras, Bluetooth mics, screen share.'],
]

function Welcome() {
  const start = (demo: boolean) => {
    audio.ensure()
    store.set(demo ? { started: true } : { started: true, page: 'setup', setupSection: 'devices' })
    if (demo) loadDemo()
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
          <span className="hdr-name">Tally</span>
        </div>
        <h1>Multicam recording and control</h1>
        <p className="welcome-lead">Connect every camera and microphone, set them up from one place, and record them all in sync for editing.</p>
        <div className="welcome-actions">
          <button className="btn btn-primary btn-lg" onClick={() => start(false)}>
            <Icon name="plus" size={16} /> Connect devices
          </button>
          <button className="btn btn-lg" onClick={() => start(true)}>
            Open demo studio
          </button>
        </div>
        {import.meta.env.VITE_PREVIEW === '1' && (
          <p className="note">
            Browser preview: the demo works fully, but cameras, microphones, Wi-Fi phones, Bluetooth and saving files are blocked here. Use the full app to connect real devices.
          </p>
        )}
        <ul className="welcome-feats">
          {FEATURES.map(([icon, title, text]) => (
            <li key={title}>
              <Icon name={icon} size={16} />
              <div>
                <b>{title}</b>
                <span>{text}</span>
              </div>
            </li>
          ))}
        </ul>
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
