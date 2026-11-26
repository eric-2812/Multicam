import { useRef, useState } from 'react'
import { addCardFiles, takeHasFolder, type CardFile } from '../engine/recorder'
import { runTC, todTC } from '../engine/timecode'
import { store, toast, useStore, type Take } from '../store'
import { Icon } from './Icon'
import { fmtBytes } from './ui'

const KIND_LABEL = { camera: 'Camera', audio: 'Audio', program: 'Program', sidecar: 'Edit file', phone: 'Phone', card: 'Camera card' } as const

/** Cameras that took part in a take: from its file names, its on-card cameras, and what's connected now. */
function camerasOf(take: Take) {
  const out: { number: number; camera: string }[] = []
  const seen = new Set<string>()
  const add = (number: number, camera: string) => {
    // One entry per camera number (the take's own files come first); unnumbered ones by name.
    const k = number ? `#${number}` : camera
    if (seen.has(k)) return
    seen.add(k)
    out.push({ number, camera })
  }
  for (const f of take.files) {
    const m = /_C(\d+)_(.+?)_\d{8}\.[a-z0-9]+$/i.exec(f.name)
    if (f.kind === 'camera' && m) add(Number(m[1]), m[2].replace(/_/g, ' '))
  }
  take.onCard.forEach((n) => add(0, n))
  store.get().sources.forEach((s) => add(s.number, s.name))
  return out
}

/** Bring the cameras' own card recordings (often 4K) into a take. */
function CardImport({ take }: { take: Take }) {
  const input = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [who, setWho] = useState<number[]>([])
  const [busy, setBusy] = useState<number | null>(null)
  const cams = camerasOf(take)
  const toFolder = takeHasFolder(take)

  const start = async () => {
    setBusy(0)
    try {
      const items: CardFile[] = files.map((file, i) => ({ file, ...(cams[who[i]] ?? { number: 0, camera: 'Camera' }) }))
      const n = await addCardFiles(take, items, (done, total) => setBusy(total ? Math.round((done / total) * 100) : 100))
      toast(n ? `${n} card file${n > 1 ? 's' : ''} added to take ${take.number}` : 'Those files are already in this take', n ? 'good' : 'info')
      setFiles([])
    } catch (e) {
      toast(`Could not add the card files: ${(e as Error).message}`, 'bad')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="card-import">
      <input
        ref={input}
        type="file"
        accept="video/*,.mp4,.mov,.mxf,.mts,.m2ts,.avi"
        multiple
        hidden
        onChange={(e) => {
          const list = [...(e.target.files ?? [])]
          setFiles(list)
          setWho(list.map((_, i) => Math.min(i, Math.max(0, cams.length - 1))))
          e.target.value = ''
        }}
      />
      {!files.length ? (
        <div className="row">
          <button className="btn btn-sm" disabled={take.endMs === null} onClick={() => input.current?.click()}>
            <Icon name="plus" size={13} /> Add files from camera cards (4K)
          </button>
          <span className="hint">
            The full-quality files the cameras recorded on their own cards. They’re {toFolder ? 'copied into this take’s folder' : 'saved next to the other files'}, named like
            the rest.
          </span>
        </div>
      ) : (
        <div className="card-list">
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="card-row">
              <span className="mono file">{f.name}</span>
              <span className="mono">{fmtBytes(f.size)}</span>
              <select
                className="inp"
                aria-label={`Camera for ${f.name}`}
                value={who[i] ?? 0}
                disabled={busy !== null}
                onChange={(e) => setWho((w) => w.map((x, j) => (j === i ? Number(e.target.value) : x)))}
              >
                {cams.map((c, k) => (
                  <option key={k} value={k}>
                    {c.number ? `Cam ${c.number} · ${c.camera}` : c.camera}
                  </option>
                ))}
                {!cams.length && <option value={0}>Camera</option>}
              </select>
            </div>
          ))}
          <div className="row">
            <button className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => void start()}>
              {busy !== null ? `Copying… ${busy}%` : `Add ${files.length} file${files.length > 1 ? 's' : ''} to take ${take.number}`}
            </button>
            <button className="btn btn-sm btn-ghost" disabled={busy !== null} onClick={() => setFiles([])}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function TakesPage() {
  const takes = useStore((s) => s.takes)
  const fps = useStore((s) => s.fps)
  return (
    <div className="takes">
      <div className="setup-inner">
        <header className="setup-head">
          <h1>Takes</h1>
          <p>Takes recorded on this computer. Import a take’s camera files into your editor as a multicam clip — they all start on the same frame.</p>
        </header>
        {!takes.length && (
          <div className="empty empty-inline">
            <Icon name="film" size={24} />
            <h2>No takes yet</h2>
            <p>Press REC (or R) to record every armed camera and mic.</p>
            <button className="btn" onClick={() => store.set({ page: 'setup', setupSection: 'recording' })}>
              Recording settings
            </button>
          </div>
        )}
        {takes.map((t) => {
          const total = t.files.reduce((a, f) => a + f.bytes, 0)
          return (
            <section key={`${t.number}-${t.startMs}`} className="take">
              <header className="take-head">
                <h2>
                  Take {String(t.number).padStart(3, '0')}
                  {t.endMs === null && <span className="tag tag-pgm">Recording</span>}
                </h2>
                <dl>
                  <div>
                    <dt>Start</dt>
                    <dd className="mono">{todTC(t.startMs, fps)}</dd>
                  </div>
                  <div>
                    <dt>Duration</dt>
                    <dd className="mono">{t.endMs ? runTC(t.endMs - t.startMs, fps) : '—'}</dd>
                  </div>
                  <div>
                    <dt>Files</dt>
                    <dd className="mono">{t.files.length}</dd>
                  </div>
                  <div>
                    <dt>Size</dt>
                    <dd className="mono">{fmtBytes(total)}</dd>
                  </div>
                  <div>
                    <dt>Markers</dt>
                    <dd className="mono">{t.markers}</dd>
                  </div>
                  {t.onCard.length > 0 && (
                    <div>
                      <dt>On camera cards</dt>
                      <dd>{t.onCard.join(', ')}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Saved to</dt>
                    <dd className="mono">{t.dest}</dd>
                  </div>
                </dl>
              </header>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Type</th>
                    <th className="num">Size</th>
                  </tr>
                </thead>
                <tbody>
                  {t.files.map((f) => (
                    <tr key={f.name}>
                      <td className="mono file">{f.name}</td>
                      <td>{KIND_LABEL[f.kind]}</td>
                      <td className="num mono">{fmtBytes(f.bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <CardImport take={t} />
            </section>
          )
        })}
      </div>
    </div>
  )
}
