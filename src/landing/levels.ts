import { animate, utils } from 'animejs'

// A level that moves like sound: a smooth run through random peaks that ends where it started, so
// the loop never jumps.
export const levels = (els: HTMLElement[], prop: 'scaleX' | 'scaleY', lo: number, hi: number) =>
  els.map((el, i) => {
    const pts = Array.from({ length: 14 }, () => utils.random(lo, hi, 2))
    pts.push(pts[0])
    return animate(el, {
      [prop]: pts.map((to) => ({ to, duration: utils.random(110, 220), ease: 'inOutQuad' })),
      loop: true,
      delay: i * 60,
      autoplay: false,
    })
  })
