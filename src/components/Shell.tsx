import { useEffect, useRef, useState } from 'react'
import { recorder, whyCantRecord } from '../engine/recorder'
import { masterTC, nowMs, runTC } from '../engine/timecode'
import { video } from '../engine/video'
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
    if (since) return void recorder.stop()
    // Explain why, and take the operator to where cameras are connected.
    if (blocked) {
      toast(`${blocked}.`, 'bad')
      if (!store.get().sources.length) store.set({ page: 'setup', setupSection: 'devices', addTab: 'usb' })
      return
    }
    void recorder.start()
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
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const st = store.get()
      const digit = /^Digit([1-9])$/.exec(e.code)
      if (digit) {
        const src = st.sources.find((s) => s.number === Number(digit[1]))
        if (!src) return
        if (e.shiftKey) video.hotCut(src.id)
        else store.set({ selected: src.id, preview: src.id === st.program ? st.preview : src.id })
      } else if (e.code === 'Space') video.cut()
      else if (e.code === 'Enter' || e.code === 'NumpadEnter') video.auto()
      else if (e.key === 'r' || e.key === 'R') void (recorder.active ? recorder.stop() : recorder.start())
      else if (e.key === 'm' || e.key === 'M') recorder.marker()
      else if (e.key === 's' || e.key === 'S') recorder.slate()
      else if (e.key === 'f' || e.key === 'F') store.set({ ftb: !st.ftb })
      else if (e.key === 'l' || e.key === 'L') store.set({ lowerThird: { ...st.lowerThird, on: !st.lowerThird.on } })
      else if (e.key === 'g' || e.key === 'G') store.set({ view: 'grid', page: 'live' })
      else if (e.key === 'v' || e.key === 'V') store.set({ view: 'focus', page: 'live' })
      else if (e.key === 'x' || e.key === 'X') store.set({ view: 'switch', page: 'live' })
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function Shell() {
  const page = useStore((s) => s.page)
  const rec = useStore((s) => !!s.recordingSince)
  useShortcuts()
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
    </div>
  )
}
