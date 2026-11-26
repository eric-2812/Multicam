import { useEffect, useRef, useState } from 'react'
import { recorder, whyCantRecord } from '../engine/recorder'
import { masterTC, nowMs, runTC } from '../engine/timecode'
import { video } from '../engine/video'
import { handleKey, useOsd } from '../engine/keys'
import { allowPhone, decline, useJoinRequests } from '../engine/phone'
import { store, toast, useStore, type Page } from '../store'
import { Icon } from './Icon'
import { LivePage } from './LivePage'
import { SetupPage } from './SetupPage'
import { TakesPage } from './TakesPage'
import { fmtBytes } from './ui'

/** Re-render on an interval (for clocks and counters that aren't in the store). */
function useTick(ms: number) {
  const [, set] = useState(0)
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms)
    return () => clearInterval(t)
  }, [ms])
}

function Timecode() {
  const ref = useRef<HTMLSpanElement>(null)
  const mode = useStore((s) => s.tcMode)
  const fps = useStore((s) => s.fps)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const st = store.get()
      if (ref.current) ref.current.textContent = masterTC(nowMs(), st.fps, st.tcMode, st.recordingSince)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <button className="tc" onClick={() => store.set({ page: 'setup', setupSection: 'sync' })} title="Master timecode · open timecode & sync settings">
      <span className="tc-mode">{mode === 'tod' ? 'TOD' : 'REC'}</span>
      <span ref={ref} className="tc-val" />
      <span className="tc-mode">{fps}p</span>
    </button>
  )
}

function RecButton() {
  const since = useStore((s) => s.recordingSince)
  const armed = useStore((s) => s.sources.filter((x) => x.rec.armed && x.status === 'live').length)
  const onCard = useStore((s) => s.remotes.filter((r) => r.follow && r.status === 'connected').length)
  const fps = useStore((s) => s.fps)
  useTick(500)
  const blocked = useStore((s) => (s.recordingSince ? null : whyCantRecord(s)))
  const toggle = () => {
    if (since) return recorder.toggle()
    // Explain why, and take the operator to where cameras are connected.
    if (blocked) {
      toast(`${blocked}.`, 'bad')
      if (!store.get().sources.length) store.set({ page: 'setup', setupSection: 'devices', addTab: 'usb' })
      return
    }
    recorder.toggle()
  }
  return (
    <button
      className={`rec ${since ? 'is-rec' : ''} ${blocked ? 'is-blocked' : ''}`}
      onClick={toggle}
      aria-pressed={!!since}
      aria-disabled={!!blocked}
      title={since ? 'Stop recording (R)' : (blocked ?? 'Record every armed camera and mic (R)')}
    >
      <span className="rec-dot" aria-hidden />
      <span className="rec-label">{since ? 'STOP' : 'REC'}</span>
      <span className="rec-meta">
        {since
          ? `${runTC(nowMs() - since, fps)} · ${fmtBytes(recorder.totalBytes())}`
          : blocked
            ? 'No camera'
            : `${armed} cam${armed === 1 ? '' : 's'} armed${onCard ? ` · ${onCard} on card` : ''}`}
      </span>
    </button>
  )
}

const PAGES: { id: Page; label: string; icon: string }[] = [
  { id: 'live', label: 'Live', icon: 'grid' },
  { id: 'setup', label: 'Setup', icon: 'settings' },
  { id: 'takes', label: 'Takes', icon: 'film' },
]

function Header() {
  const page = useStore((s) => s.page)
  const project = useStore((s) => s.project)
  const since = useStore((s) => s.recordingSince)
  return (
    <header className="hdr">
      <div className="hdr-brand">
        <span className="mark" aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="hdr-name">Cortiva</span>
      </div>
      <nav className="hdr-nav" aria-label="Pages">
        {PAGES.map((p) => (
          <button key={p.id} className={page === p.id ? 'is-on' : ''} aria-current={page === p.id ? 'page' : undefined} onClick={() => store.set({ page: p.id })}>
            <Icon name={p.icon} size={14} />
            <span className="nav-l">{p.label}</span>
          </button>
        ))}
      </nav>
      <div className="hdr-proj" title="Project and next take — change in Setup → Project">
        <span className="hdr-proj-name">{project.name}</span>
        <span className="hdr-take">Take {String(project.take).padStart(3, '0')}</span>
      </div>
      <div className="hdr-transport">
        <Timecode />
        <button className="tbtn tbtn-marker" onClick={() => recorder.marker()} disabled={!since} title="Add a marker (M)">
          <Icon name="marker" size={14} />
          <span className="hide-md">Marker</span>
        </button>
        <button className="tbtn" onClick={() => recorder.slate()} title="Slate: flash + beep on every camera, mic and phone (S)">
          <Icon name="flash" size={14} />
          <span className="hide-md">Slate</span>
        </button>
        <RecButton />
      </div>
    </header>
  )
}

function StatusBar() {
  const cams = useStore((s) => s.sources.length)
  const live = useStore((s) => s.sources.filter((x) => x.status === 'live').length)
  const mics = useStore((s) => s.channels.length)
  const rec = useStore((s) => s.rec)
  const aligned = useStore((s) => {
    const t = [...s.sources, ...s.channels].filter((x) => x.status === 'live').map((x) => (x.latency ?? 0) + x.delay)
    return !t.length || Math.max(...t) - Math.min(...t) <= 25
  })
  const fps = useFps()
  return (
    <footer className="status">
      <span>
        {live}/{cams} cameras
      </span>
      <span>{mics} mics</span>
      <button className="st-link" onClick={() => store.set({ page: 'setup', setupSection: 'recording' })}>
        <Icon name="folder" size={12} /> {rec.dest === 'folder' && rec.folderName ? rec.folderName : 'Downloads'} · {rec.format.toUpperCase()}
      </button>
      <button className="st-link" onClick={() => store.set({ page: 'setup', setupSection: 'sync' })}>
        <span className={`dot ${aligned ? 'dot-ok' : 'dot-warn'}`} /> {aligned ? 'In sync' : 'Sync off'}
      </button>
      <span className="grow" />
      <span className="mono">{fps} fps render</span>
      <span className="mono hide-sm" title={`Cortiva ${__APP_VERSION__}`}>
        v{__APP_VERSION__}
      </span>
    </footer>
  )
}

function useFps() {
  const [fps, setFps] = useState(0)
  useEffect(() => {
    let n = 0
    let raf = 0
    const t0 = { v: performance.now() }
    const loop = () => {
      n++
      const now = performance.now()
      if (now - t0.v > 1000) {
        setFps(Math.round((n * 1000) / (now - t0.v)))
        n = 0
        t0.v = now
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return fps
}

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

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input:not([type=range]), textarea, select, [role=application], [role=slider]')) return
      if (handleKey(e)) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

type UpdateInfo = Parameters<Parameters<NonNullable<Window['cortivaDesktop']>['onUpdate']>[0]>[0]

/** Desktop app: a new version downloads by itself; this says so and offers to restart into it. */
function useUpdate() {
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  useEffect(() => window.cortivaDesktop?.onUpdate(setInfo), [])
  return info
}

function UpdateBanner({ info }: { info: UpdateInfo | null }) {
  const rec = useStore((s) => !!s.recordingSince)
  const [hidden, setHidden] = useState<string | null>(null)
  if (!info || (info.state !== 'ready' && info.state !== 'available') || hidden === info.version) return null
  const notes = `https://github.com/eric-2812/cortiva/releases/tag/v${info.version}`
  return (
    <div className="update-banner" role="status">
      <Icon name="download" size={14} />
      <span>
        {info.state === 'ready' ? (
          <>
            <b>Cortiva {info.version}</b> is ready. It installs when you close Cortiva, or now:
          </>
        ) : (
          <>
            <b>Cortiva {info.version}</b> is out. This portable copy can’t update itself — download the new one.
          </>
        )}
      </span>
      <a href={notes} target="_blank" rel="noreferrer" className="linkbtn">
        What’s new
      </a>
      {info.state === 'ready' ? (
        <button className="btn btn-sm btn-primary" disabled={rec} title={rec ? 'Stop recording first' : undefined} onClick={() => window.cortivaDesktop?.installUpdate()}>
          Restart to update
        </button>
      ) : (
        <a className="btn btn-sm btn-primary" href={notes} target="_blank" rel="noreferrer">
          Download
        </a>
      )}
      <button className="icon-btn" aria-label="Hide" onClick={() => setHidden(info.version ?? '')}>
        <Icon name="close" size={12} />
      </button>
    </div>
  )
}

/** Phones asking to join over Wi-Fi: nothing gets in until someone here allows it. */
function JoinPrompts() {
  const reqs = useJoinRequests()
  if (!reqs.length) return null
  return (
    <div className="join-prompts" role="region" aria-label="Phones asking to join">
      {reqs.map((r) => (
        <div key={r.peer} className="join-prompt" role="alert">
          <Icon name="phone" size={16} />
          <p>
            <b>{r.name}</b> wants to join as a camera over Wi-Fi.
            <small>Only allow phones you know — anyone with the room code can ask.</small>
          </p>
          <div className="row">
            <button className="btn btn-sm btn-ghost" onClick={() => decline(r.peer)}>
              Deny
            </button>
            <button className="btn btn-sm btn-primary" onClick={() => allowPhone(r.peer)}>
              Allow
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

/** What a shortcut just changed ("Cam 1 — Shutter 1/100 · 180°"), shown briefly over the picture. */
function KeyReadout() {
  const o = useOsd()
  if (!o) return null
  return (
    <div key={o.id} className={`osd ${o.tone === 'bad' ? 'osd-bad' : ''}`} role="status" aria-live="polite">
      {o.text}
    </div>
  )
}

export function Shell() {
  const page = useStore((s) => s.page)
  const rec = useStore((s) => !!s.recordingSince)
  useShortcuts()
  const update = useUpdate()
  useEffect(() => video.start(), [])
  // Warn before closing the tab mid-take.
  useEffect(() => {
    if (!rec) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [rec])
  return (
    <div className={`app ${rec ? 'is-recording' : ''}`}>
      <Header />
      <UpdateBanner info={update} />
      <main className="app-main">
        {/* Live stays mounted: the program monitor keeps rendering (and recording) while you're in Setup. */}
        <div className="page-live" hidden={page !== 'live'}>
          <LivePage />
        </div>
        {page === 'setup' && <SetupPage />}
        {page === 'takes' && <TakesPage />}
      </main>
      <StatusBar />
      <Toasts />
      <KeyReadout />
      <JoinPrompts />
    </div>
  )
}
