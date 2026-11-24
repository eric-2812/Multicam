import { useEffect, useState } from 'react'
import { AddDevice } from './components/AddDevice'
import { Icon } from './components/Icon'
import { Inspector } from './components/Inspector'
import { Mixer } from './components/Mixer'
import { Monitors } from './components/Monitors'
import { Multiview } from './components/Multiview'
import { PhoneSender } from './components/PhoneSender'
import { TopBar } from './components/TopBar'
import { loadDemo } from './demo/demo'
import { audio } from './engine/audio'
import { video } from './engine/video'
import { store, useStore } from './store'

function Toasts() {
  const toasts = useStore((s) => s.toasts)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}

const SHORTCUTS: [string, string][] = [
  ['1 – 9', 'Put camera on preview'],
  ['Shift + 1 – 9', 'Cut camera straight to program'],
  ['Space', 'Cut'],
  ['Enter', 'Auto transition'],
  ['R', 'Start / stop recording'],
  ['F', 'Fade to black'],
  ['L', 'Lower third on / off'],
  ['Double-click a tile', 'Take it to program'],
]

function Help({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-sm" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <header className="modal-head">
          <h2>Keyboard shortcuts</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <dl className="shortcuts">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k}>
              <dt>
                <kbd>{k}</kbd>
              </dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

function useShortcuts(onHelp: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input:not([type=range]), textarea, select, [role=application]') || store.get().addOpen) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const st = store.get()
      const digit = /^Digit([1-9])$/.exec(e.code)
      if (digit) {
        const src = st.sources[Number(digit[1]) - 1]
        if (!src) return
        if (e.shiftKey) video.hotCut(src.id)
        else if (src.id !== st.program) store.set({ preview: src.id, selected: src.id })
      } else if (e.code === 'Space') video.cut()
      else if (e.code === 'Enter' || e.code === 'NumpadEnter') video.auto()
      else if (e.key === 'r' || e.key === 'R') video.isRecording ? video.stopRecording() : video.startRecording()
      else if (e.key === 'f' || e.key === 'F') store.set({ ftb: !st.ftb })
      else if (e.key === 'l' || e.key === 'L') store.set({ lowerThird: { ...st.lowerThird, on: !st.lowerThird.on } })
      else if (e.key === '?') onHelp()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onHelp])
}

function ControlRoom() {
  const [help, setHelp] = useState(false)
  const empty = useStore((s) => s.sources.length === 0)
  useShortcuts(() => setHelp(true))
  useEffect(() => video.start(), [])
  return (
    <div className="room">
      <TopBar onHelp={() => setHelp(true)} />
      <main className="room-main">
        <div className="room-left">
          <Monitors />
          {empty && (
            <div className="empty-banner">
              <p>
                <b>No cameras yet.</b> Plug in a webcam, connect a phone over Wi-Fi, add an IP camera — or load the demo to look around first.
              </p>
              <div className="row">
                <button className="btn btn-primary" onClick={() => store.set({ addOpen: true })}>
                  <Icon name="plus" /> Add device
                </button>
                <button className="btn" onClick={loadDemo}>
                  Load demo devices
                </button>
              </div>
            </div>
          )}
          <Multiview />
        </div>
        <Inspector />
      </main>
      <Mixer />
      <AddDevice />
      {help && <Help onClose={() => setHelp(false)} />}
      <Toasts />
    </div>
  )
}

function Welcome() {
  const start = (demo: boolean) => {
    audio.ensure()
    store.set({ started: true, addOpen: !demo })
    if (demo) loadDemo()
  }
  return (
    <main className="welcome">
      <div className="welcome-inner">
        <div className="brand brand-lg">
          <span className="brand-mark" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="brand-name">Tally</span>
        </div>
        <h1>Every camera and mic, one control room.</h1>
        <p className="welcome-lead">
          Switch live between cameras, steer PTZ heads, mix microphones and record the program — from the browser. Plug devices in over USB, join phones over Wi-Fi, add IP cameras and pair Bluetooth mics.
        </p>
        <div className="welcome-cards">
          <button className="wcard wcard-demo" onClick={() => start(true)}>
            <span className="wcard-tag">No setup</span>
            <strong>Try the demo</strong>
            <span>Seven simulated cameras, five mics and Bluetooth accessories — a live talk show to switch.</span>
            <span className="wcard-go">Open demo →</span>
          </button>
          <button className="wcard" onClick={() => start(false)}>
            <span className="wcard-tag">Real devices</span>
            <strong>Connect my devices</strong>
            <span>Webcams, capture cards, phones on Wi-Fi, IP cameras, USB and Bluetooth microphones.</span>
            <span className="wcard-go">Start connecting →</span>
          </button>
        </div>
        <ul className="welcome-links">
          <li>
            <Icon name="usb" /> USB & built-in
          </li>
          <li>
            <Icon name="wifi" /> Phones over Wi-Fi
          </li>
          <li>
            <Icon name="network" /> IP / PTZ cameras
          </li>
          <li>
            <Icon name="bluetooth" /> Bluetooth mics
          </li>
          <li>
            <Icon name="screen" /> Screen share
          </li>
        </ul>
      </div>
    </main>
  )
}

export function App() {
  const started = useStore((s) => s.started)
  const join = new URLSearchParams(location.search).get('join')
  if (join) return <PhoneSender room={join} />
  return started ? <ControlRoom /> : <Welcome />
}
