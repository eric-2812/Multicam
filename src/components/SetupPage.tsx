import { loadDemo, unloadDemo } from '../demo/demo'
import { chooseFolder, folderSupported } from '../engine/recorder'
import { store, toast, updateSource, useStore, type SetupSection } from '../store'
import { DevicesSection } from './Devices'
import { Icon } from './Icon'
import { SyncSection } from './SyncSection'
import { Row, Seg, Switch } from './ui'

const NAV: { id: SetupSection; label: string; icon: string; desc: string }[] = [
  { id: 'project', label: 'Project', icon: 'film', desc: 'Name, takes and notes' },
  { id: 'devices', label: 'Devices', icon: 'cam', desc: 'Cameras, mics and accessories' },
  { id: 'recording', label: 'Recording', icon: 'folder', desc: 'Where and what gets recorded' },
  { id: 'sync', label: 'Timecode & sync', icon: 'clock', desc: 'Master clock, latency, slate' },
  { id: 'shortcuts', label: 'Shortcuts', icon: 'keyboard', desc: 'Keyboard control' },
]

function ProjectSection() {
  const p = useStore((s) => s.project)
  const demo = useStore((s) => s.demo)
  const recording = useStore((s) => !!s.recordingSince)
  const set = (patch: Partial<typeof p>) => store.set((s) => ({ project: { ...s.project, ...patch } }))
  return (
    <div className="form">
      <Row label="Project name" htmlFor="pj-name" hint="Starts every file name">
        <input id="pj-name" className="inp" value={p.name} maxLength={48} disabled={recording} onChange={(e) => set({ name: e.target.value })} />
      </Row>
      <Row label="Next take" htmlFor="pj-take">
        <input id="pj-take" className="inp inp-num" type="number" min={1} max={999} value={p.take} disabled={recording} onChange={(e) => set({ take: Math.max(1, Math.min(999, Number(e.target.value) || 1)) })} />
      </Row>
      <Row label="Notes" htmlFor="pj-notes" hint="Saved in every take sheet">
        <textarea id="pj-notes" className="inp" rows={4} value={p.notes} placeholder="Location, crew, scene…" onChange={(e) => set({ notes: e.target.value })} />
      </Row>
      <p className="hint">
        Files are named <code>{(p.name || 'Untitled').replace(/[^\w-]+/g, '_')}_T{String(p.take).padStart(3, '0')}_C1_Camera_HHMMSSFF.mp4</code>
      </p>
      <h3 className="set-h">Demo devices</h3>
      <Row label="Simulated studio" hint="Seven cameras, five mics and Bluetooth accessories, to try everything without hardware">
        <Switch label="Demo devices" on={demo} disabled={recording} onChange={(v) => (v ? loadDemo() : unloadDemo())} />
      </Row>
    </div>
  )
}

const MBPS = { low: 4, med: 8, high: 16 }

function RecordingSection() {
  const rec = useStore((s) => s.rec)
  const sources = useStore((s) => s.sources)
  const channels = useStore((s) => s.channels.length)
  const recording = useStore((s) => !!s.recordingSince)
  const set = (patch: Partial<typeof rec>) => store.set((s) => ({ rec: { ...s.rec, ...patch } }))
  const armed = sources.filter((s) => s.rec.armed).length
  const mp4 = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4')
  const webm = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/webm')
  const gbPerHour = ((armed + (rec.program ? 1 : 0)) * MBPS[rec.quality] * 3600) / 8 / 1024 + (rec.mics ? channels * 0.09 : 0)
  return (
    <div className="form">
      <fieldset disabled={recording} className="fs">
        <Row label="Save to">
          <Seg
            label="Destination"
            value={rec.dest}
            options={[
              { v: 'folder', label: 'Folder', title: folderSupported() ? 'Write files straight into a folder while recording' : 'Needs Chrome or Edge on a computer' },
              { v: 'downloads', label: 'Downloads', title: 'Each file downloads when the take ends' },
            ]}
            onChange={(v) => {
              if (v === 'folder' && !folderSupported()) return toast('Saving to a folder needs Chrome or Edge on a computer.', 'bad')
              if (v === 'folder' && !rec.folderName) void chooseFolder().catch(() => {})
              else set({ dest: v })
            }}
          />
        </Row>
        {rec.dest === 'folder' && (
          <Row label="Folder">
            <div className="row">
              <span className="ro mono">{rec.folderName ?? 'None chosen'}</span>
              <button className="btn btn-sm" onClick={() => void chooseFolder().catch(() => {})}>
                <Icon name="folder" size={13} /> Choose…
              </button>
            </div>
          </Row>
        )}
        <p className="hint">
          {rec.dest === 'folder'
            ? 'Each take gets its own sub-folder; files are written as they record, so long takes don’t fill memory.'
            : 'Files are kept in memory and download when you stop. Fine for short takes; for long ones, record to a folder. Your browser may ask once to allow multiple downloads.'}
        </p>
        <Row label="Format">
          <Seg
            label="Format"
            value={rec.format}
            options={[
              { v: 'mp4', label: 'MP4 · H.264', title: mp4 ? '' : 'Not supported in this browser — WebM will be used' },
              { v: 'webm', label: 'WebM · VP9', title: webm ? '' : 'Not supported in this browser — MP4 will be used' },
            ]}
            onChange={(v) => set({ format: v })}
          />
        </Row>
        <Row label="Quality">
          <Seg
            label="Quality"
            value={rec.quality}
            options={[
              { v: 'low', label: '4 Mb/s' },
              { v: 'med', label: '8 Mb/s' },
              { v: 'high', label: '16 Mb/s' },
            ]}
            onChange={(v) => set({ quality: v })}
          />
        </Row>

        <div className="estimate">
        <span>Per hour</span>
        <b className="mono">≈ {gbPerHour.toFixed(1)} GB</b>
        <span>
          {armed} camera{armed === 1 ? '' : 's'}
          {rec.program ? ' + program' : ''}
          {rec.mics ? ` + ${channels} mic${channels === 1 ? '' : 's'}` : ''}
        </span>
      </div>
        <h3 className="set-h">What gets recorded</h3>
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>Camera</th>
              <th>Feed</th>
              <th className="num">Record</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id}>
                <td className="mono">{s.number}</td>
                <td>
                  <b>{s.name}</b>
                  <small>{s.hw?.height ? `${s.hw.width}×${s.hw.height}${s.hw.fps ? ` · ${s.hw.fps} fps` : ''}` : s.detail}</small>
                </td>
                <td>
                  <Seg
                    label={`${s.name} feed`}
                    value={s.rec.feed}
                    disabled={s.kind === 'demo' || s.kind === 'url'}
                    options={[
                      { v: 'clean', label: 'Clean' },
                      { v: 'processed', label: 'Processed' },
                    ]}
                    onChange={(v) => updateSource(s.id, { rec: { ...s.rec, feed: v } })}
                  />
                </td>
                <td className="num">
                  <Switch label={`Record ${s.name}`} on={s.rec.armed} onChange={(v) => updateSource(s.id, { rec: { ...s.rec, armed: v } })} />
                </td>
              </tr>
            ))}
            {!sources.length && (
              <tr>
                <td colSpan={4} className="empty-row">
                  No cameras yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Row label="Each microphone" hint="Its own audio file, before the fader: clean tracks for the edit">
          <Switch label="Record each microphone" on={rec.mics} onChange={(v) => set({ mics: v })} />
        </Row>
        <Row label="Scratch audio on cameras" hint="The program mix on every camera file, so editors can auto-sync by waveform">
          <Switch label="Scratch audio" on={rec.scratch} onChange={(v) => set({ scratch: v })} />
        </Row>
        <Row label="Switched program" hint="The live-cut version with transitions, titles and the mix">
          <Switch label="Record program" on={rec.program} onChange={(v) => set({ program: v })} />
        </Row>
        <Row label="Phones record locally" hint="Each phone also saves its own full-quality file on the phone">
          <Switch label="Phones record locally" on={rec.phoneLocal} onChange={(v) => set({ phoneLocal: v })} />
        </Row>
        <Row label="Edit files" hint="EDL of the live cuts, markers CSV and a JSON take sheet with timecode, latency and camera settings">
          <Switch label="Sidecar files" on={rec.sidecar} onChange={(v) => set({ sidecar: v })} />
        </Row>
      </fieldset>
      {recording && <p className="warn">Settings are locked while recording.</p>}
    </div>
  )
}

const KEYS: [string, string][] = [
  ['R', 'Start / stop recording'],
  ['M', 'Marker'],
  ['S', 'Slate (flash + beep everywhere)'],
  ['1 – 9', 'Select camera (and put it on preview)'],
  ['Shift + 1 – 9', 'Cut camera to program'],
  ['Space', 'Cut'],
  ['Enter', 'Auto transition'],
  ['G / V / X', 'Grid / Focus / Switcher view'],
  ['F', 'Fade to black'],
  ['L', 'Title (lower third) on / off'],
  ['Double-click tile', 'Cut to program'],
]

function ShortcutsSection() {
  return (
    <table className="tbl tbl-keys">
      <tbody>
        {KEYS.map(([k, v]) => (
          <tr key={k}>
            <td>
              <kbd>{k}</kbd>
            </td>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function SetupPage() {
  const sec = useStore((s) => s.setupSection)
  const cur = NAV.find((n) => n.id === sec) ?? NAV[0]
  return (
    <div className="setup">
      <nav className="setup-nav" aria-label="Setup sections">
        {NAV.map((n) => (
          <button key={n.id} className={sec === n.id ? 'is-on' : ''} aria-current={sec === n.id ? 'page' : undefined} onClick={() => store.set({ setupSection: n.id })}>
            <Icon name={n.icon} size={15} />
            <span>
              {n.label}
              <small>{n.desc}</small>
            </span>
          </button>
        ))}
      </nav>
      <div className="setup-body">
        <div className="setup-inner">
          <header className="setup-head">
            <h1>{cur.label}</h1>
            <p>{cur.desc}</p>
          </header>
          {sec === 'project' && <ProjectSection />}
          {sec === 'devices' && <DevicesSection />}
          {sec === 'recording' && <RecordingSection />}
          {sec === 'sync' && <SyncSection />}
          {sec === 'shortcuts' && <ShortcutsSection />}
        </div>
      </div>
    </div>
  )
}
