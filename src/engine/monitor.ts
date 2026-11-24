import type { Guides } from '../store'

/**
 * Exposure and focus assists for the focus monitor, computed on a downscaled copy of the
 * camera frame so they stay cheap: zebra stripes, focus peaking and a luma histogram.
 */
const AW = 480
const AH = 270
const work = document.createElement('canvas')
work.width = AW
work.height = AH
const wctx = work.getContext('2d', { willReadFrequently: true })!
const over = document.createElement('canvas')
over.width = AW
over.height = AH
const octx = over.getContext('2d')!
const luma = new Float32Array(AW * AH)

export const histogram = new Float32Array(64)

export function analyse(frame: HTMLCanvasElement, opts: { zebra: boolean; zebraLevel: number; peaking: boolean; histogram: boolean }, phase: number) {
  wctx.drawImage(frame, 0, 0, AW, AH)
  const src = wctx.getImageData(0, 0, AW, AH).data
  histogram.fill(0)
  for (let i = 0, p = 0; p < luma.length; i += 4, p++) {
    const y = 0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2]
    luma[p] = y
    histogram[(y / 256) * 64 | 0]++
  }
  if (!opts.zebra && !opts.peaking) return null
  const out = octx.createImageData(AW, AH)
  const d = out.data
  const zl = (opts.zebraLevel / 100) * 255
  for (let y = 1; y < AH - 1; y++) {
    for (let x = 1; x < AW - 1; x++) {
      const p = y * AW + x
      const o = p * 4
      if (opts.peaking) {
        // Sobel gradient: strong edges are in focus.
        const gx = -luma[p - AW - 1] - 2 * luma[p - 1] - luma[p + AW - 1] + luma[p - AW + 1] + 2 * luma[p + 1] + luma[p + AW + 1]
        const gy = -luma[p - AW - 1] - 2 * luma[p - AW] - luma[p - AW + 1] + luma[p + AW - 1] + 2 * luma[p + AW] + luma[p + AW + 1]
        if (gx * gx + gy * gy > 52000) {
          d[o] = 255
          d[o + 1] = 40
          d[o + 2] = 40
          d[o + 3] = 255
          continue
        }
      }
      if (opts.zebra && luma[p] >= zl && ((x + y + phase) & 7) < 3) {
        d[o] = d[o + 1] = d[o + 2] = 235
        d[o + 3] = 230
      }
    }
  }
  octx.putImageData(out, 0, 0)
  return over
}

export function drawGuides(ctx: CanvasRenderingContext2D, w: number, h: number, g: Guides) {
  if (g === 'off') return
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,.55)'
  ctx.lineWidth = 1
  ctx.setLineDash([])
  ctx.beginPath()
  if (g === 'thirds') {
    for (const f of [1 / 3, 2 / 3]) {
      ctx.moveTo(w * f, 0)
      ctx.lineTo(w * f, h)
      ctx.moveTo(0, h * f)
      ctx.lineTo(w, h * f)
    }
  } else if (g === 'center') {
    ctx.moveTo(w / 2 - 14, h / 2)
    ctx.lineTo(w / 2 + 14, h / 2)
    ctx.moveTo(w / 2, h / 2 - 14)
    ctx.lineTo(w / 2, h / 2 + 14)
  } else if (g === 'safe') {
    // Action safe 93%, title safe 90%.
    ctx.rect(w * 0.035, h * 0.035, w * 0.93, h * 0.93)
    ctx.stroke()
    ctx.beginPath()
    ctx.setLineDash([4, 4])
    ctx.rect(w * 0.05, h * 0.05, w * 0.9, h * 0.9)
  } else if (g === 'scope') {
    // 2.39:1 frame lines with the outside dimmed.
    const ih = w / 2.39
    const top = (h - ih) / 2
    ctx.fillStyle = 'rgba(0,0,0,.5)'
    ctx.fillRect(0, 0, w, top)
    ctx.fillRect(0, h - top, w, top)
    ctx.moveTo(0, top)
    ctx.lineTo(w, top)
    ctx.moveTo(0, h - top)
    ctx.lineTo(w, h - top)
  }
  ctx.stroke()
  ctx.restore()
}
