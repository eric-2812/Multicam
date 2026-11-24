import { store, toast, type State, type Take, type TakeFile } from '../store'
import type { VideoSource } from '../types'
import { audio } from './audio'
import { recordRemotes } from './bluecams'
import { nowMs, runTC, todTC } from './timecode'
import { download, video } from './video'

/**
 * "Record everything": every armed camera, every microphone and the switched program each
 * go to their own file, all started on the same frame, plus sidecar files for the edit.
 * Files stream straight into a folder where the browser allows it (Chrome / Edge), otherwise
 * they download when the take ends.
 */

type DirHandle = {
  name: string
  getDirectoryHandle(n: string, o?: { create?: boolean }): Promise<DirHandle>
  getFileHandle(n: string, o?: { create?: boolean }): Promise<{ createWritable(): Promise<Writable> }>
  queryPermission?(o: { mode: string }): Promise<string>
  requestPermission?(o: { mode: string }): Promise<string>
}
type Writable = { write(d: Blob | string): Promise<void>; close(): Promise<void> }

let folder: DirHandle | null = null

export function folderSupported() {
  return 'showDirectoryPicker' in window
}

export async function chooseFolder() {
  const pick = (window as unknown as { showDirectoryPicker(o: object): Promise<DirHandle> }).showDirectoryPicker
  folder = await pick({ mode: 'readwrite', id: 'cortiva-recordings' })
  store.set((s) => ({ rec: { ...s.rec, dest: 'folder', folderName: folder!.name } }))
}

interface Sink {
  write(b: Blob): void
  close(): Promise<void>
}

/** Appends chunks to a file in the take folder as they arrive. */
async function folderSink(dir: DirHandle, name: string): Promise<Sink> {
  const fh = await dir.getFileHandle(name, { create: true })
  const w = await fh.createWritable()
  let chain = Promise.resolve()
  return {
    write: (b) => void (chain = chain.then(() => w.write(b))),
    close: () => (chain = chain.then(() => w.close())),
  }
}

function downloadSink(name: string, type: string): Sink {
  const parts: Blob[] = []
  return {
    write: (b) => void parts.push(b),
    close: async () => download(new Blob(parts, { type }), name),
  }
}

const BITRATE = { low: 4_000_000, med: 8_000_000, high: 16_000_000 }

function pickMime(format: 'mp4' | 'webm', kind: 'av' | 'v' | 'a') {
  const opts = {
    mp4: { av: ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'], v: ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.42E01E', 'video/mp4'], a: ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4'] },
    webm: { av: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'], v: ['video/webm;codecs=vp9', 'video/webm'], a: ['audio/webm;codecs=opus', 'audio/webm'] },
  }
  const other = format === 'mp4' ? 'webm' : 'mp4'
  return [...opts[format][kind], ...opts[other][kind]].find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
}

/**
 * Why REC can't start right now, or null if it can. A take needs at least one camera: an armed,
 * live source, or a GoPro / Sony paired over Bluetooth that records on its card.
 */
export function whyCantRecord(st: State): string | null {
  const cams = st.sources.filter((s) => s.rec.armed && s.status === 'live').length
  const onCard = st.remotes.filter((r) => r.follow && r.status === 'connected').length
  if (cams || onCard) return null
  if (!st.sources.length && !st.remotes.length) return 'Connect a camera to record'
  if (st.sources.some((s) => s.status === 'live')) return 'Arm a camera to record (Setup → Recording)'
  return 'No camera is live right now'
}

const extOf = (mime: string, audioOnly: boolean) => (mime.includes('mp4') ? (audioOnly ? 'm4a' : 'mp4') : 'webm')
const safe = (s: string) => s.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'x'
const pad = (n: number, w = 3) => String(n).padStart(w, '0')

export interface LogEvent {
  ms: number
  kind: 'cut' | 'slate' | 'marker'
  id: string | null
  name: string
  note?: string
}

interface Track {
  rec: MediaRecorder
  file: TakeFile
  sourceId?: string
  done: Promise<void>
  /** Tracks created for this file (clones, canvas captures) — stopped when the take ends. */
  stream: MediaStream
}

class Recorder {
  private tracks: Track[] = []
  private log: LogEvent[] = []
  private startMs = 0
  private take: Take | null = null
  private dir: DirHandle | null = null
  private unsub: (() => void) | null = null
  private lastProgram: string | null = null
  private sinks: Sink[] = []
  private busy = false

  get active() {
    return !!this.take
  }

  /** Bytes written so far for a camera (null when it isn't recording). */
  bytes(sourceId: string) {
    const t = this.tracks.find((x) => x.sourceId === sourceId)
    return t ? t.file.bytes : null
  }

  totalBytes() {
    return this.tracks.reduce((a, t) => a + t.file.bytes, 0)
  }

  private async open(name: string, type: string) {
    const sink = this.dir ? await folderSink(this.dir, name) : downloadSink(name, type)
    this.sinks.push(sink)
    return sink
  }

  private async addTrack(stream: MediaStream, name: string, mime: string, kind: TakeFile['kind'], bitrate: number, sourceId?: string) {
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate, audioBitsPerSecond: 192_000 })
    const sink = await this.open(name, mime || 'video/webm')
    const file: TakeFile = { name, kind, bytes: 0 }
    const done = new Promise<void>((res) => {
      rec.ondataavailable = (e) => {
        if (!e.data.size) return
        file.bytes += e.data.size
        sink.write(e.data)
      }
      rec.onstop = () => res()
    })
    this.tracks.push({ rec, file, sourceId, done, stream })
  }

  async start() {
    if (this.take || this.busy) return
    const blocked = whyCantRecord(store.get())
    if (blocked) {
      toast(`${blocked}.`, 'bad')
      return
    }
    this.busy = true
    const st = store.get()
    const cfg = st.rec
    const base = `${safe(st.project.name)}_T${pad(st.project.take)}`
    try {
      this.dir = null
      if (cfg.dest === 'folder' && folder) {
        const perm = (await folder.queryPermission?.({ mode: 'readwrite' })) ?? 'granted'
        if (perm !== 'granted' && (await folder.requestPermission?.({ mode: 'readwrite' })) !== 'granted') {
          throw new Error('No permission to write to the recording folder. Choose it again in Setup → Recording.')
        }
        this.dir = await folder.getDirectoryHandle(base, { create: true })
      } else if (cfg.dest === 'folder') {
        toast('No recording folder chosen — files will download when the take ends.', 'info')
      }

      const startMs = nowMs()
      const tc = todTC(startMs, st.fps).replace(/:/g, '')
      const bitrate = BITRATE[cfg.quality]
      const mix = audio.stream.getAudioTracks()[0]
      this.tracks = []
      this.sinks = []

      const cams = st.sources.filter((s) => s.rec.armed && s.status === 'live')
      for (const src of cams) {
        const raw = src.rec.feed === 'clean' ? video.rawStream(src.id) : null
        const v = raw?.getVideoTracks()[0]?.clone() ?? video.frame(src.id).captureStream(st.fps).getVideoTracks()[0]
        const tracks: MediaStreamTrack[] = [v]
        if (cfg.scratch && mix) tracks.push(mix.clone())
        const mime = pickMime(cfg.format, tracks.length > 1 ? 'av' : 'v')
        const name = `${base}_C${src.number}_${safe(src.name)}_${tc}.${extOf(mime, false)}`
        await this.addTrack(new MediaStream(tracks), name, mime, 'camera', bitrate, src.id)
      }
      if (cfg.mics) {
        for (const [i, ch] of st.channels.filter((c) => c.status === 'live').entries()) {
          // Record a copy: the channel's tap is shared across takes and must keep running.
          const s = audio.channelStream(ch.id)
          if (!s) continue
          const mime = pickMime(cfg.format, 'a')
          const name = `${base}_A${i + 1}_${safe(ch.name)}_${tc}.${extOf(mime, true)}`
          await this.addTrack(new MediaStream(s.getAudioTracks().map((t) => t.clone())), name, mime, 'audio', 0)
        }
      }
      if (cfg.program && video.programCanvas) {
        const tracks = [video.programCanvas.captureStream(st.fps).getVideoTracks()[0]]
        if (mix) tracks.push(mix.clone())
        const mime = pickMime(cfg.format, 'av')
        await this.addTrack(new MediaStream(tracks), `${base}_PGM_${tc}.${extOf(mime, false)}`, mime, 'program', bitrate)
      }
      const followers = st.remotes.filter((r) => r.follow && r.status === 'connected')
      if (!this.tracks.length && !followers.length) throw new Error('Nothing to record — connect and arm a camera.')

      // Start everything back to back so all files share the same first frame.
      this.tracks.forEach((t) => t.rec.start(1000))
      const onCard = recordRemotes(true)
      this.startMs = startMs
      this.log = []
      this.lastProgram = st.program
      if (st.program) this.event('cut', st.program)
      this.unsub = store.subscribe(() => {
        const p = store.get().program
        if (p !== this.lastProgram) {
          this.lastProgram = p
          if (p) this.event('cut', p)
        }
      })
      this.take = {
        number: st.project.take,
        name: base,
        startMs,
        endMs: null,
        files: this.tracks.map((t) => t.file),
        markers: 0,
        dest: this.dir ? `${folder!.name}/${base}` : 'Downloads',
        onCard,
      }
      if (cfg.phoneLocal) window.dispatchEvent(new CustomEvent('cortiva-rec', { detail: { on: true, take: base, startMs } }))
      store.set((s) => ({ recordingSince: startMs, takes: [this.take!, ...s.takes] }))
    } catch (e) {
      this.tracks.forEach((t) => t.rec.state !== 'inactive' && t.rec.stop())
      this.release()
      this.tracks = []
      toast(`Recording did not start: ${(e as Error).message}`, 'bad')
    } finally {
      this.busy = false
    }
  }

  /** Stop the per-take track copies; the cameras themselves keep running. */
  private release() {
    for (const t of this.tracks) t.stream.getTracks().forEach((tr) => tr.stop())
  }

  private event(kind: LogEvent['kind'], id: string | null, note?: string) {
    const name = id ? (store.get().sources.find((s) => s.id === id)?.name ?? id) : ''
    this.log.push({ ms: nowMs(), kind, id, name, note })
  }

  /** Drop a marker at this moment (exported with the take). */
  marker() {
    const st = store.get()
    if (!this.take) return toast('Markers are added while recording.', 'info')
    this.event('marker', st.program, `M${this.log.filter((e) => e.kind === 'marker').length + 1}`)
    this.take.markers++
    toast(`Marker at ${runTC(nowMs() - this.startMs, st.fps)}`, 'info')
  }

  /** Flash + beep on every camera, mic, phone and file at once. */
  slate() {
    video.flash()
    audio.slate()
    if (this.take) this.event('slate', store.get().program)
    window.dispatchEvent(new CustomEvent('cortiva-slate'))
    toast(`Slate at ${todTC(nowMs(), store.get().fps)}`, 'info')
  }

  async stop() {
    if (!this.take || this.busy) return
    this.busy = true
    const st = store.get()
    const end = nowMs()
    this.unsub?.()
    this.tracks.forEach((t) => t.rec.state !== 'inactive' && t.rec.stop())
    recordRemotes(false)
    window.dispatchEvent(new CustomEvent('cortiva-rec', { detail: { on: false } }))
    store.set({ recordingSince: null })
    await Promise.all(this.tracks.map((t) => t.done))
    this.release()

    const take = this.take
    take.endMs = end
    if (st.rec.sidecar) {
      const sheet = this.takeSheet(take, st.sources, end)
      const side: [string, string, string][] = [
        [`${take.name}.edl`, buildEdl(this.log, this.startMs, end, st.fps, take.name), 'text/plain'],
        [`${take.name}_markers.csv`, buildCsv(this.log, this.startMs, st.fps), 'text/csv'],
        [`${take.name}_take.json`, JSON.stringify(sheet, null, 2), 'application/json'],
      ]
      for (const [name, text, type] of side) {
        const sink = await this.open(name, type)
        const blob = new Blob([text], { type })
        sink.write(blob)
        take.files.push({ name, kind: 'sidecar', bytes: blob.size })
      }
    }
    await Promise.all(this.sinks.map((s) => s.close()))
    const n = take.files.length
    toast(`Take ${take.number} saved: ${n} files → ${take.dest}`, 'good')
    this.take = null
    this.tracks = []
    store.set((s) => ({
      takes: s.takes.map((t) => (t.number === take.number && t.startMs === take.startMs ? { ...take, files: [...take.files] } : t)),
      project: { ...s.project, take: s.project.take + 1 },
    }))
    this.busy = false
  }

  private takeSheet(take: Take, sources: VideoSource[], end: number) {
    const st = store.get()
    return {
      project: st.project.name,
      take: take.number,
      notes: st.project.notes,
      fps: st.fps,
      start: { unixMs: Math.round(take.startMs), timeOfDay: todTC(take.startMs, st.fps) },
      durationTC: runTC(end - take.startMs, st.fps),
      note: 'All files start on the same frame. latencyMs is how late each device delivered picture/sound; clean feeds are not delay-compensated, so slip them earlier by latencyMs in the edit if needed.',
      cameras: sources
        .filter((s) => take.files.some((f) => f.name.includes(`_C${s.number}_`)))
        .map((s) => ({
          number: s.number,
          name: s.name,
          link: s.link,
          detail: s.detail,
          feed: s.rec.feed,
          resolution: s.hw?.width ? `${s.hw.width}x${s.hw.height}` : null,
          fps: s.hw?.fps ?? null,
          latencyMs: s.latency ?? null,
          syncDelayMs: s.rec.feed === 'processed' ? s.delay : 0,
          settings: s.settings,
          file: take.files.find((f) => f.name.includes(`_C${s.number}_`))?.name,
        })),
      onCameraCards: take.onCard.map((name) => ({ camera: name, note: 'Recorded on the camera’s own card; started with this take (Bluetooth adds ~0.1–0.5 s). Line up with the slate.' })),
      microphones: st.channels.map((c, i) => ({ track: `A${i + 1}`, name: c.name, link: c.link, latencyMs: c.latency ?? null, syncDelayMs: c.delay })),
      events: this.log.map((e) => ({ ...e, recordTC: runTC(e.ms - this.startMs, st.fps), timeOfDay: todTC(e.ms, st.fps) })),
      files: take.files,
    }
  }
}

/** CMX3600 EDL of the live cuts — a starting point for the multicam edit. */
function buildEdl(log: LogEvent[], since: number, end: number, fps: 25 | 30, title: string) {
  const cuts = log.filter((e) => e.kind === 'cut')
  const lines = [`TITLE: ${title.toUpperCase()}`, 'FCM: NON-DROP FRAME', '']
  cuts.forEach((c, i) => {
    const out = cuts[i + 1]?.ms ?? end
    const reel = (c.name.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8) || 'AX').padEnd(8)
    lines.push(`${pad(i + 1)}  ${reel} V     C        ${todTC(c.ms, fps)} ${todTC(out, fps)} ${runTC(c.ms - since, fps)} ${runTC(out - since, fps)}`)
    lines.push(`* FROM CLIP NAME: ${oneLine(c.name)}`)
    log
      .filter((e) => e.kind !== 'cut' && e.ms >= c.ms && e.ms < out)
      .forEach((e) => lines.push(`* ${e.kind.toUpperCase()}${e.note ? ` ${oneLine(e.note)}` : ''} AT ${runTC(e.ms - since, fps)}`))
    lines.push('')
  })
  return lines.join('\r\n')
}

// eslint-disable-next-line no-control-regex
const oneLine = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, ' ')

/**
 * A CSV cell that a spreadsheet shows as text: quoted, and never read as a formula (camera names
 * can come from phones on the network).
 */
const cell = (s: string) => {
  const v = oneLine(s)
  return `"${(/^[=+\-@]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`
}

function buildCsv(log: LogEvent[], since: number, fps: 25 | 30) {
  const rows = ['event,name,record_tc,time_of_day_tc,unix_ms,program_camera']
  log.forEach((e) => rows.push(`${e.kind},${cell(e.note ?? '')},${runTC(e.ms - since, fps)},${todTC(e.ms, fps)},${Math.round(e.ms)},${cell(e.name)}`))
  return rows.join('\n')
}

export const recorder = new Recorder()
