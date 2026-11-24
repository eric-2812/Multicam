import { runTC, todTC } from '../engine/timecode'
import { store, useStore } from '../store'
import { Icon } from './Icon'
import { fmtBytes } from './ui'

const KIND_LABEL = { camera: 'Camera', audio: 'Audio', program: 'Program', sidecar: 'Edit file', phone: 'Phone' } as const

export function TakesPage() {
  const takes = useStore((s) => s.takes)
  const fps = useStore((s) => s.fps)
  return (
    <div className="takes">
      <div className="setup-inner">
        <header className="setup-head">
          <h1>Takes</h1>
          <p>Everything recorded in this session. Import a take’s camera files into your editor as a multicam clip — they all start on the same frame.</p>
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
            </section>
          )
        })}
      </div>
    </div>
  )
}
