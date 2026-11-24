import { talk } from './voices'

/**
 * Procedural "camera feeds" for demo mode. Each scene draws in a world space where the
 * framed view at zoom 1 is 1600×900; the margins beyond that are only seen when a PTZ
 * camera pans or tilts. The caller has already applied the camera transform.
 */
export const WORLD_W = 1600
export const WORLD_H = 900

type Ctx = CanvasRenderingContext2D
type Scene = (ctx: Ctx, t: number) => void

function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

interface PersonLook {
  skin: string
  hair: string
  shirt: string
  collar: string
  hairStyle: 'short' | 'long' | 'bun'
}

const HOST: PersonLook = { skin: '#c98d6b', hair: '#2a1a14', shirt: '#24405e', collar: '#e8e2d6', hairStyle: 'short' }
const GUEST: PersonLook = { skin: '#e4b896', hair: '#7a3b1e', shirt: '#7c2f3a', collar: '#1d1d22', hairStyle: 'long' }

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** A stylised person; (x, y) is the centre of the head, s the scale (head radius = 62·s). */
function person(ctx: Ctx, x: number, y: number, s: number, look: PersonLook, mouth: number, t: number, seed: number) {
  const bob = Math.sin(t * 1.3 + seed) * 3 * s + mouth * 4 * s
  const turn = Math.sin(t * 0.37 + seed * 2) * 6 * s
  ctx.save()
  // torso
  ctx.fillStyle = look.shirt
  ctx.beginPath()
  ctx.moveTo(x - 150 * s, y + 420 * s)
  ctx.bezierCurveTo(x - 160 * s, y + 140 * s, x - 120 * s, y + 95 * s, x, y + 92 * s)
  ctx.bezierCurveTo(x + 120 * s, y + 95 * s, x + 160 * s, y + 140 * s, x + 150 * s, y + 420 * s)
  ctx.fill()
  // collar
  ctx.fillStyle = look.collar
  ctx.beginPath()
  ctx.moveTo(x - 38 * s, y + 92 * s)
  ctx.lineTo(x, y + 150 * s)
  ctx.lineTo(x + 38 * s, y + 92 * s)
  ctx.fill()
  // neck
  ctx.fillStyle = look.skin
  ctx.fillRect(x - 24 * s, y + 40 * s + bob, 48 * s, 60 * s - bob)
  ctx.fillStyle = 'rgba(0,0,0,.12)'
  ctx.fillRect(x - 24 * s, y + 70 * s, 48 * s, 18 * s)

  const hy = y + bob
  const hx = x + turn
  // long hair behind the head
  if (look.hairStyle === 'long') {
    ctx.fillStyle = look.hair
    rr(ctx, hx - 74 * s, hy - 50 * s, 148 * s, 170 * s, 50 * s)
    ctx.fill()
  }
  // head
  ctx.fillStyle = look.skin
  ctx.beginPath()
  ctx.ellipse(hx, hy, 58 * s, 70 * s, 0, 0, Math.PI * 2)
  ctx.fill()
  // ears
  ctx.beginPath()
  ctx.ellipse(hx - 57 * s, hy + 4 * s, 9 * s, 15 * s, 0, 0, Math.PI * 2)
  ctx.ellipse(hx + 57 * s, hy + 4 * s, 9 * s, 15 * s, 0, 0, Math.PI * 2)
  ctx.fill()
  // hair on top
  ctx.fillStyle = look.hair
  ctx.beginPath()
  if (look.hairStyle === 'short') {
    ctx.ellipse(hx, hy - 38 * s, 62 * s, 40 * s, 0, Math.PI, Math.PI * 2)
    ctx.rect(hx - 62 * s, hy - 40 * s, 14 * s, 26 * s)
    ctx.rect(hx + 48 * s, hy - 40 * s, 14 * s, 26 * s)
  } else {
    ctx.ellipse(hx + 6 * s, hy - 36 * s, 66 * s, 44 * s, -0.12, Math.PI, Math.PI * 2)
  }
  ctx.fill()
  // eyes, with an occasional blink
  const blink = (t + seed) % 4.1 < 0.12 ? 0.15 : 1
  const gaze = turn * 0.4
  ctx.fillStyle = '#1b1414'
  ctx.beginPath()
  ctx.ellipse(hx - 21 * s + gaze, hy - 2 * s, 6 * s, 7 * s * blink, 0, 0, Math.PI * 2)
  ctx.ellipse(hx + 21 * s + gaze, hy - 2 * s, 6 * s, 7 * s * blink, 0, 0, Math.PI * 2)
  ctx.fill()
  // brows
  ctx.strokeStyle = look.hair
  ctx.lineWidth = 5 * s
  ctx.lineCap = 'round'
  const lift = mouth * 4 * s
  ctx.beginPath()
  ctx.moveTo(hx - 31 * s + gaze, hy - 20 * s - lift)
  ctx.lineTo(hx - 11 * s + gaze, hy - 22 * s - lift)
  ctx.moveTo(hx + 11 * s + gaze, hy - 22 * s - lift)
  ctx.lineTo(hx + 31 * s + gaze, hy - 20 * s - lift)
  ctx.stroke()
  // mouth follows the voice envelope
  ctx.fillStyle = '#5a2626'
  ctx.beginPath()
  ctx.ellipse(hx + gaze * 0.6, hy + 34 * s, 15 * s, (2.5 + mouth * 11) * s, 0, 0, Math.PI * 2)
  ctx.fill()
  // a touch of shading
  ctx.fillStyle = 'rgba(0,0,0,.08)'
  ctx.beginPath()
  ctx.ellipse(hx + 26 * s, hy + 6 * s, 30 * s, 62 * s, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function lavMic(ctx: Ctx, x: number, y: number, s: number) {
  ctx.fillStyle = '#111'
  rr(ctx, x - 6 * s, y, 12 * s, 20 * s, 4 * s)
  ctx.fill()
}

// ------------------------------------------------------------------ scenes

const stage: Scene = (ctx, t) => {
  const g = ctx.createLinearGradient(0, -400, 0, 1300)
  g.addColorStop(0, '#0b1020')
  g.addColorStop(0.6, '#18223d')
  g.addColorStop(1, '#0d0f16')
  ctx.fillStyle = g
  ctx.fillRect(-700, -400, 3000, 1700)
  // vertical light strips on the side flats
  for (let i = 0; i < 9; i++) {
    const x = -500 + i * 330
    if (x > 300 && x < 1300) continue
    const a = 0.35 + 0.25 * Math.sin(t * 1.4 + i)
    ctx.fillStyle = `rgba(90,160,255,${a})`
    ctx.fillRect(x, 40, 14, 640)
  }
  // LED wall
  const wx = 330, wy = 70, ww = 940, wh = 470
  const lg = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh)
  const h = (t * 12) % 360
  lg.addColorStop(0, `hsl(${h},70%,32%)`)
  lg.addColorStop(1, `hsl(${(h + 70) % 360},75%,22%)`)
  ctx.fillStyle = lg
  ctx.fillRect(wx, wy, ww, wh)
  ctx.save()
  ctx.beginPath()
  ctx.rect(wx, wy, ww, wh)
  ctx.clip()
  ctx.globalAlpha = 0.25
  for (let i = 0; i < 14; i++) {
    const y = wy + ((i * 52 + t * 40) % (wh + 60)) - 30
    ctx.fillStyle = '#fff'
    ctx.fillRect(wx, y, ww, 2)
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = 'rgba(255,255,255,.92)'
  ctx.font = '700 64px "Barlow Condensed", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('MORNING SESSIONS', 800, 240)
  ctx.font = '500 26px "Barlow Condensed", system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,.65)'
  ctx.fillText('LIVE  ·  EPISODE 112', 800, 285)
  ctx.restore()
  // LED wall bezel
  ctx.strokeStyle = '#05070c'
  ctx.lineWidth = 10
  ctx.strokeRect(wx, wy, ww, wh)
  // floor
  const fg = ctx.createLinearGradient(0, 640, 0, 1300)
  fg.addColorStop(0, '#22262f')
  fg.addColorStop(1, '#0c0d11')
  ctx.fillStyle = fg
  ctx.fillRect(-700, 640, 3000, 700)
  // people
  person(ctx, 560, 410, 0.62, HOST, talk.host, t, 1)
  person(ctx, 1040, 400, 0.6, GUEST, talk.guest, t, 5)
  // desk
  ctx.fillStyle = '#e9e4da'
  ctx.beginPath()
  ctx.moveTo(300, 600)
  ctx.lineTo(1300, 600)
  ctx.lineTo(1380, 680)
  ctx.lineTo(220, 680)
  ctx.fill()
  ctx.fillStyle = '#1b1f29'
  ctx.fillRect(250, 680, 1100, 220)
  ctx.fillStyle = `rgba(90,160,255,${0.6 + 0.3 * Math.sin(t * 2)})`
  ctx.fillRect(250, 690, 1100, 6)
  // mugs
  ctx.fillStyle = '#d24a3a'
  rr(ctx, 690, 560, 34, 44, 4)
  ctx.fill()
  ctx.fillStyle = '#f2f2f2'
  rr(ctx, 880, 556, 34, 48, 4)
  ctx.fill()
  // ceiling lights
  for (let i = 0; i < 6; i++) {
    const x = 150 + i * 260
    const rg = ctx.createRadialGradient(x, -40, 0, x, -40, 160)
    rg.addColorStop(0, 'rgba(255,240,210,.55)')
    rg.addColorStop(1, 'rgba(255,240,210,0)')
    ctx.fillStyle = rg
    ctx.fillRect(x - 160, -200, 320, 320)
  }
}

function bokeh(ctx: Ctx, t: number, hues: number[], seed: number) {
  const rnd = seeded(seed)
  for (let i = 0; i < 26; i++) {
    const x = -600 + rnd() * 2800
    const y = -300 + rnd() * 1300
    const r = 40 + rnd() * 110
    const hue = hues[i % hues.length]
    const a = 0.12 + 0.12 * Math.sin(t * (0.3 + rnd()) + i)
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r)
    rg.addColorStop(0, `hsla(${hue},80%,70%,${a + 0.1})`)
    rg.addColorStop(0.7, `hsla(${hue},80%,60%,${a})`)
    rg.addColorStop(1, `hsla(${hue},80%,60%,0)`)
    ctx.fillStyle = rg
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
}

const hostCu: Scene = (ctx, t) => {
  const g = ctx.createLinearGradient(0, -400, 0, 1300)
  g.addColorStop(0, '#2b1a12')
  g.addColorStop(1, '#120b08')
  ctx.fillStyle = g
  ctx.fillRect(-700, -400, 3000, 1700)
  bokeh(ctx, t, [30, 38, 20, 200], 7)
  person(ctx, 800, 360, 2.1, HOST, talk.host, t, 1)
  lavMic(ctx, 800 - 60, 360 + 240, 2.1)
}

const guestCu: Scene = (ctx, t) => {
  const g = ctx.createLinearGradient(0, -400, 0, 1300)
  g.addColorStop(0, '#121a33')
  g.addColorStop(1, '#090b16')
  ctx.fillStyle = g
  ctx.fillRect(-700, -400, 3000, 1700)
  // bookshelf
  const rnd = seeded(11)
  for (let row = 0; row < 5; row++) {
    const y = -100 + row * 230
    ctx.fillStyle = '#1c1f2c'
    ctx.fillRect(-600, y + 200, 2800, 16)
    let x = -600
    while (x < 2200) {
      const w = 22 + rnd() * 30
      const h = 120 + rnd() * 70
      ctx.fillStyle = `hsl(${200 + rnd() * 140},${25 + rnd() * 25}%,${20 + rnd() * 18}%)`
      ctx.fillRect(x, y + 200 - h, w, h)
      x += w + 3 + (rnd() < 0.1 ? 60 : 0)
    }
  }
  ctx.fillStyle = 'rgba(8,10,20,.45)'
  ctx.fillRect(-700, -400, 3000, 1700)
  bokeh(ctx, t, [260, 220, 300], 3)
  person(ctx, 820, 370, 2.0, GUEST, talk.guest, t, 5)
  lavMic(ctx, 820 + 50, 370 + 235, 2.0)
}

const overhead: Scene = (ctx, t) => {
  // wood
  ctx.fillStyle = '#8a5a35'
  ctx.fillRect(-700, -400, 3000, 1700)
  const rnd = seeded(21)
  for (let i = 0; i < 70; i++) {
    const y = -400 + i * 25
    ctx.fillStyle = `rgba(${rnd() < 0.5 ? '60,30,10' : '190,130,80'},${0.08 + rnd() * 0.1})`
    ctx.fillRect(-700, y, 3000, 6 + rnd() * 10)
  }
  // laptop
  ctx.fillStyle = '#b9bcc4'
  rr(ctx, 120, 160, 620, 420, 22)
  ctx.fill()
  ctx.fillStyle = '#101218'
  rr(ctx, 150, 190, 560, 360, 10)
  ctx.fill()
  ctx.strokeStyle = '#4ade80'
  ctx.lineWidth = 3
  ctx.beginPath()
  for (let x = 0; x <= 520; x += 6) {
    const lvl = (talk.host + talk.guest) * 60 + 8
    const y = 370 + Math.sin(x * 0.07 + t * 9) * lvl * Math.sin(x * 0.012 + t)
    if (x === 0) ctx.moveTo(170 + x, y)
    else ctx.lineTo(170 + x, y)
  }
  ctx.stroke()
  ctx.fillStyle = '#f43f5e'
  ctx.beginPath()
  ctx.arc(190, 215, 8 + Math.sin(t * 5) * 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#9ca3af'
  ctx.font = '600 22px "IBM Plex Mono", monospace'
  ctx.fillText('REC 00:' + String(Math.floor(t) % 60).padStart(2, '0'), 210, 223)
  // notebook
  ctx.save()
  ctx.translate(1080, 470)
  ctx.rotate(-0.12)
  ctx.fillStyle = '#f7f3ea'
  rr(ctx, -230, -300, 460, 600, 10)
  ctx.fill()
  ctx.strokeStyle = 'rgba(80,120,200,.35)'
  ctx.lineWidth = 2
  for (let y = -240; y < 280; y += 34) {
    ctx.beginPath()
    ctx.moveTo(-200, y)
    ctx.lineTo(200, y)
    ctx.stroke()
  }
  // handwriting that keeps growing
  const written = (t * 90) % 2400
  ctx.strokeStyle = '#1e3a8a'
  ctx.lineWidth = 3
  let drawn = 0
  let pen = { x: -190, y: -246 }
  for (let line = 0; line < 14 && drawn < written; line++) {
    ctx.beginPath()
    const y = -246 + line * 34
    ctx.moveTo(-190, y)
    for (let x = -190; x < 180 && drawn < written; x += 4) {
      ctx.lineTo(x, y + Math.sin(x * 0.35 + line * 3) * 6 * Math.sin(x * 0.05 + line))
      drawn += 4
      pen = { x, y }
    }
    ctx.stroke()
  }
  // pen
  ctx.fillStyle = '#111827'
  ctx.save()
  ctx.translate(pen.x, pen.y)
  ctx.rotate(0.7)
  rr(ctx, -6, -150, 12, 150, 5)
  ctx.fill()
  ctx.fillStyle = '#d4af37'
  ctx.fillRect(-6, -150, 12, 18)
  ctx.restore()
  ctx.restore()
  // coffee cup with steam
  ctx.fillStyle = '#f5f5f4'
  ctx.beginPath()
  ctx.arc(1450, 170, 92, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#3b2416'
  ctx.beginPath()
  ctx.arc(1450, 170, 74, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,.18)'
  ctx.lineWidth = 6
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.arc(1450, 170, 20 + i * 18, t * (1 + i * 0.3), t * (1 + i * 0.3) + 1.6)
    ctx.stroke()
  }
  // plant
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + Math.sin(t * 0.5) * 0.04
    ctx.fillStyle = i % 2 ? '#2f6b3a' : '#3f8a4b'
    ctx.beginPath()
    ctx.ellipse(250 + Math.cos(a) * 80, 800 + Math.sin(a) * 80, 90, 34, a, 0, Math.PI * 2)
    ctx.fill()
  }
}

const drone: Scene = (ctx, t) => {
  const ox = (t * 18) % 400
  const oy = (t * 9) % 400
  ctx.save()
  ctx.translate(-ox, -oy)
  ctx.fillStyle = '#5d7d45'
  ctx.fillRect(-700, -400, 3600, 2100)
  const rnd = seeded(5)
  // fields
  for (let gx = -2; gx < 9; gx++) {
    for (let gy = -2; gy < 6; gy++) {
      const x = gx * 400
      const y = gy * 400
      const k = Math.abs((gx * 7 + gy * 13) % 5)
      const colors = ['#6c8f4e', '#8aa35a', '#b9a46a', '#4e7340', '#a7b56b']
      ctx.fillStyle = colors[k]
      ctx.fillRect(x + 10, y + 10, 380, 380)
      if (k === 2 || k === 4) {
        ctx.strokeStyle = 'rgba(0,0,0,.08)'
        ctx.lineWidth = 3
        for (let r = 20; r < 380; r += 22) {
          ctx.beginPath()
          ctx.moveTo(x + 10, y + r)
          ctx.lineTo(x + 390, y + r)
          ctx.stroke()
        }
      }
      // houses
      if (k === 1 || k === 3) {
        for (let h = 0; h < 5; h++) {
          const hx = x + 40 + rnd() * 280
          const hy = y + 40 + rnd() * 280
          ctx.fillStyle = 'rgba(0,0,0,.25)'
          ctx.fillRect(hx + 10, hy + 10, 60, 46)
          ctx.fillStyle = h % 2 ? '#b4513a' : '#d8d2c4'
          ctx.fillRect(hx, hy, 60, 46)
          ctx.fillStyle = 'rgba(0,0,0,.12)'
          ctx.fillRect(hx + 30, hy, 30, 46)
        }
      }
    }
  }
  // roads
  ctx.fillStyle = '#3d3f44'
  for (let gx = -2; gx < 9; gx++) ctx.fillRect(gx * 400 - 10, -800, 20, 3000)
  for (let gy = -2; gy < 6; gy++) ctx.fillRect(-800, gy * 400 - 10, 4400, 20)
  // river
  ctx.strokeStyle = '#3b6f8f'
  ctx.lineWidth = 70
  ctx.beginPath()
  for (let y = -600; y < 2000; y += 40) {
    const x = 700 + Math.sin(y * 0.004) * 260
    if (y === -600) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  // cars
  for (let i = 0; i < 26; i++) {
    const lane = i % 2 ? 1 : -1
    const gx = (i % 9) - 2
    const p = ((t * (60 + (i % 5) * 15) * lane + i * 300) % 2800 + 2800) % 2800 - 800
    ctx.fillStyle = ['#e11d48', '#f8fafc', '#facc15', '#0ea5e9'][i % 4]
    if (i % 3 === 0) ctx.fillRect(gx * 400 - 8 + lane * 4, p, 8, 16)
    else ctx.fillRect(p, ((i % 6) - 2) * 400 - 8 + lane * 4, 16, 8)
  }
  ctx.restore()
  // drifting cloud shadows
  for (let i = 0; i < 4; i++) {
    const x = ((t * 25 + i * 700) % 3200) - 900
    const y = 100 + i * 230
    const rg = ctx.createRadialGradient(x, y, 0, x, y, 320)
    rg.addColorStop(0, 'rgba(0,0,0,.22)')
    rg.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = rg
    ctx.fillRect(x - 320, y - 320, 640, 640)
  }
}

const crowd: Scene = (ctx, t) => {
  ctx.fillStyle = '#07070b'
  ctx.fillRect(-700, -400, 3000, 1700)
  // stage glow
  const sg = ctx.createLinearGradient(0, -200, 0, 500)
  sg.addColorStop(0, '#2a0f3d')
  sg.addColorStop(1, '#07070b')
  ctx.fillStyle = sg
  ctx.fillRect(-700, -400, 3000, 900)
  // beams
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const beamColors = ['255,80,200', '80,160,255', '255,200,80', '120,255,200']
  for (let i = 0; i < 6; i++) {
    const bx = -200 + i * 400
    const a = Math.sin(t * (0.5 + i * 0.13) + i) * 0.6
    const len = 1500
    const ex = bx + Math.sin(a) * len
    const ey = -300 + Math.cos(a) * len
    const lg = ctx.createLinearGradient(bx, -300, ex, ey)
    lg.addColorStop(0, `rgba(${beamColors[i % 4]},.45)`)
    lg.addColorStop(1, `rgba(${beamColors[i % 4]},0)`)
    ctx.fillStyle = lg
    ctx.beginPath()
    ctx.moveTo(bx, -300)
    const nx = Math.cos(a) * 120
    const ny = -Math.sin(a) * 120
    ctx.lineTo(ex + nx, ey + ny)
    ctx.lineTo(ex - nx, ey - ny)
    ctx.fill()
  }
  ctx.restore()
  // performer silhouette on stage, far away
  ctx.fillStyle = '#000'
  ctx.beginPath()
  ctx.arc(800, 250 + talk.beat * 4, 22, 0, Math.PI * 2)
  ctx.fill()
  rr(ctx, 770, 272, 60, 110, 18)
  ctx.fill()
  // crowd rows, back to front
  const rnd = seeded(31)
  for (let row = 0; row < 6; row++) {
    const y = 420 + row * 110
    const s = 0.7 + row * 0.18
    const tone = 12 + row * 4
    for (let i = 0; i < 26; i++) {
      const x = -600 + i * (120 - row * 6) + (row % 2) * 45 + rnd() * 20
      const phase = rnd() * 6
      const bounce = Math.abs(Math.sin(t * 4.2 + phase)) * (6 + talk.beat * 8) * s
      ctx.fillStyle = `rgb(${tone},${tone},${tone + 6})`
      // shoulders
      rr(ctx, x - 48 * s, y - bounce + 20 * s, 96 * s, 140 * s, 40 * s)
      ctx.fill()
      // head
      ctx.beginPath()
      ctx.arc(x, y - bounce, 30 * s, 0, Math.PI * 2)
      ctx.fill()
      // arms up when the audience applauds
      if (talk.applause > 0.15 && rnd() < 0.7) {
        const up = talk.applause * 110 * s
        ctx.strokeStyle = ctx.fillStyle as string
        ctx.lineWidth = 16 * s
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(x - 40 * s, y + 30 * s - bounce)
        ctx.lineTo(x - 55 * s, y - up - bounce + Math.sin(t * 20 + i) * 6)
        ctx.moveTo(x + 40 * s, y + 30 * s - bounce)
        ctx.lineTo(x + 55 * s, y - up - bounce + Math.cos(t * 20 + i) * 6)
        ctx.stroke()
      }
      // phone screens
      if (rnd() < 0.1) {
        ctx.fillStyle = 'rgba(200,220,255,.85)'
        ctx.fillRect(x + 20 * s, y - 70 * s - bounce, 16 * s, 26 * s)
      }
    }
  }
}

export const SCENES: Record<string, Scene> = {
  stage,
  host: hostCu,
  guest: guestCu,
  overhead,
  drone,
  crowd,
}
