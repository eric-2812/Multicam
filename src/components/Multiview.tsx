import { useEffect, useRef } from 'react'
import { video } from '../engine/video'
import { store, useStore } from '../store'
import type { VideoSource } from '../types'
import { Battery, Icon, LinkBadge, Signal } from './Icon'

function Tile({ src, index }: { src: VideoSource; index: number }) {
  const host = useRef<HTMLDivElement>(null)
  const program = useStore((s) => s.program === src.id)
  const preview = useStore((s) => s.preview === src.id)
  const selected = useStore((s) => s.selected === src.id)

  useEffect(() => {
    const c = video.frame(src.id)
    host.current?.appendChild(c)
    return () => c.remove()
  }, [src.id])

  const tally = program ? 'pgm' : preview ? 'pvw' : ''
  return (
    <div
      className={`tile ${tally ? `tile-${tally}` : ''} ${selected ? 'is-selected' : ''} ${src.status !== 'live' ? 'is-down' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${src.name}${program ? ', on program' : preview ? ', on preview' : ''}`}
      onClick={() => store.set({ preview: program ? store.get().preview : src.id, selected: src.id })}
      onDoubleClick={() => video.hotCut(src.id)}
      onKeyDown={(e) => e.key === 'Enter' && store.set({ preview: src.id, selected: src.id })}
    >
      <div className="tile-video" ref={host} />
      <div className="tile-top">
        <span className="tile-num">{index + 1}</span>
        {program && <span className="tally-tag pgm">ON AIR</span>}
        {preview && !program && <span className="tally-tag pvw">PREVIEW</span>}
        <span className="grow" />
        {src.latency !== undefined && (
          <span className={`lat ${src.delay ? 'has-delay' : ''}`} title={`Arrives ${src.latency} ms late${src.delay ? `, delayed ${src.delay} ms to stay in sync` : ''}`}>
            {src.latency + src.delay}ms
          </span>
        )}
        {src.signal !== undefined && <Signal bars={src.status === 'live' ? src.signal : 0} />}
        {src.battery !== undefined && <Battery level={src.battery} />}
      </div>
      <div className="tile-bottom">
        <span className="tile-name">{src.name}</span>
        <LinkBadge link={src.link} />
        <button
          className="tile-cut"
          onClick={(e) => {
            e.stopPropagation()
            video.hotCut(src.id)
          }}
          title="Cut straight to program (Shift + number)"
          disabled={program}
        >
          Take
        </button>
      </div>
    </div>
  )
}

export function Multiview() {
  const sources = useStore((s) => s.sources)
  return (
    <section className="multiview" aria-label="Sources">
      {sources.map((s, i) => (
        <Tile key={s.id} src={s} index={i} />
      ))}
      <button className="tile tile-add" onClick={() => store.set({ addOpen: true })}>
        <Icon name="plus" size={22} />
        <span>Add camera</span>
        <small>USB · Wi-Fi phone · IP camera · Screen</small>
      </button>
    </section>
  )
}
